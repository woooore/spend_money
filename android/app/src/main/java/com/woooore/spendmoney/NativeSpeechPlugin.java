package com.woooore.spendmoney;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

@CapacitorPlugin(
    name = "NativeSpeech",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class NativeSpeechPlugin extends Plugin {
    private SpeechRecognizer recognizer;
    private Intent recognizerIntent;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean keepListening = false;
    private int emptyRetries = 0;

    @PluginMethod
    public void available(PluginCall call) {
        mainHandler.post(() -> {
            JSObject ret = new JSObject();
            ret.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micPermissionCallback");
            return;
        }
        beginListening(call);
    }

    @PermissionCallback
    private void micPermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            beginListening(call);
        } else {
            call.reject("마이크 권한을 허용해 주세요");
        }
    }

    private void beginListening(PluginCall call) {
        String lang = call.getString("lang", "ko-KR");
        keepListening = true;
        emptyRetries = 0;

        mainHandler.post(() -> {
            try {
                destroyRecognizer();
                if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                    keepListening = false;
                    call.reject("기기에 음성인식 서비스가 없습니다");
                    return;
                }
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3000L);
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);

                recognizer.setRecognitionListener(new RecognitionListener() {
                    @Override
                    public void onReadyForSpeech(Bundle params) {
                        JSObject ev = new JSObject();
                        ev.put("status", "listening");
                        notifyListeners("state", ev);
                    }

                    @Override public void onBeginningOfSpeech() { emptyRetries = 0; }
                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}
                    @Override public void onEndOfSpeech() {}

                    @Override
                    public void onError(int error) {
                        if (!keepListening) return;
                        if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                            emptyRetries++;
                            if (emptyRetries <= 3 && recognizer != null) {
                                mainHandler.postDelayed(() -> {
                                    if (keepListening && recognizer != null) {
                                        try { recognizer.startListening(recognizerIntent); } catch (Exception ignored) {}
                                    }
                                }, 120);
                                return;
                            }
                        }
                        if (error == SpeechRecognizer.ERROR_CLIENT) return;
                        JSObject ev = new JSObject();
                        ev.put("code", error);
                        ev.put("message", errorMessage(error));
                        notifyListeners("speechError", ev);
                    }

                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                        if (!text.trim().isEmpty()) {
                            emptyRetries = 0;
                            JSObject ev = new JSObject();
                            ev.put("text", text.trim());
                            notifyListeners("segment", ev);
                        }
                        if (keepListening && recognizer != null) {
                            mainHandler.postDelayed(() -> {
                                if (keepListening && recognizer != null) {
                                    try { recognizer.startListening(recognizerIntent); } catch (Exception ignored) {}
                                }
                            }, 100);
                        }
                    }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                        if (!text.trim().isEmpty()) {
                            JSObject ev = new JSObject();
                            ev.put("text", text.trim());
                            notifyListeners("partial", ev);
                        }
                    }

                    @Override public void onEvent(int eventType, Bundle params) {}
                });

                recognizer.startListening(recognizerIntent);
                call.resolve();
            } catch (Exception e) {
                keepListening = false;
                call.reject("음성인식 시작 실패: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        keepListening = false;
        mainHandler.post(() -> {
            destroyRecognizer();
            call.resolve();
        });
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            try { recognizer.stopListening(); } catch (Exception ignored) {}
            try { recognizer.cancel(); } catch (Exception ignored) {}
            try { recognizer.destroy(); } catch (Exception ignored) {}
            recognizer = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        keepListening = false;
        mainHandler.post(this::destroyRecognizer);
        super.handleOnDestroy();
    }

    private String errorMessage(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "마이크 권한을 허용해 주세요";
            case SpeechRecognizer.ERROR_AUDIO: return "오디오 녹음 오류가 발생했어요";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "네트워크 연결을 확인하거나 오프라인 음성팩을 켜 주세요";
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "말씀이 들리지 않았어요";
            default: return "음성인식 오류 (" + code + ")";
        }
    }
}
