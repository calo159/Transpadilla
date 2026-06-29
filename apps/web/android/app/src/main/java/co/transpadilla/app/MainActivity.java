package co.transpadilla.app;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Impide capturas de pantalla y grabación de pantalla
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        super.onCreate(savedInstanceState);

        // Deshabilita la depuración remota de WebView en release
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
    }
}
