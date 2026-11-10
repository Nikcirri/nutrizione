package com.nikcirri.nutrizione;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.nikcirri.nutrizione.widgets.WidgetsPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin dell'app (non da npm): scarica e installa gli aggiornamenti.
        registerPlugin(AppUpdaterPlugin.class);
        // Plugin dell'app: passa i numeri al widget "Calorie" e riceve il tocco sul suo +.
        registerPlugin(WidgetsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
