package com.woooore.spendmoney;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

@CapacitorPlugin(name = "OfflineOcr")
public class OfflineOcrPlugin extends Plugin {
    @PluginMethod
    public void recognize(PluginCall call) {
        String b64 = call.getString("base64", "");
        if (b64 == null || b64.isEmpty()) {
            call.reject("이미지가 없습니다");
            return;
        }
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bmp == null) {
                call.reject("이미지를 읽을 수 없습니다");
                return;
            }
            InputImage image = InputImage.fromBitmap(bmp, 0);
            TextRecognizer recognizer = TextRecognition.getClient(
                new KoreanTextRecognizerOptions.Builder().build()
            );
            recognizer.process(image)
                .addOnSuccessListener(visionText -> {
                    // 모든 줄(Line)을 위->아래, 왼->오른 순으로 정렬하고 같은 높이는 한 줄로 합침
                    List<Text.Line> lines = new ArrayList<>();
                    for (Text.TextBlock block : visionText.getTextBlocks()) {
                        lines.addAll(block.getLines());
                    }
                    Collections.sort(lines, new Comparator<Text.Line>() {
                        @Override
                        public int compare(Text.Line a, Text.Line b) {
                            Rect ra = a.getBoundingBox();
                            Rect rb = b.getBoundingBox();
                            int ya = ra != null ? ra.centerY() : 0;
                            int yb = rb != null ? rb.centerY() : 0;
                            if (Math.abs(ya - yb) > 18) return Integer.compare(ya, yb);
                            int xa = ra != null ? ra.left : 0;
                            int xb = rb != null ? rb.left : 0;
                            return Integer.compare(xa, xb);
                        }
                    });
                    StringBuilder sb = new StringBuilder();
                    int prevY = Integer.MIN_VALUE;
                    for (Text.Line line : lines) {
                        Rect r = line.getBoundingBox();
                        int y = r != null ? r.centerY() : 0;
                        if (prevY != Integer.MIN_VALUE && Math.abs(y - prevY) <= 18) {
                            sb.append(" ").append(line.getText());
                        } else {
                            if (sb.length() > 0) sb.append("\n");
                            sb.append(line.getText());
                            prevY = y;
                        }
                    }
                    JSObject ret = new JSObject();
                    ret.put("text", sb.toString());
                    call.resolve(ret);
                })
                .addOnFailureListener(e -> call.reject("OCR 실패: " + e.getMessage()));
        } catch (Exception e) {
            call.reject("이미지 처리 오류: " + e.getMessage());
        }
    }
}
