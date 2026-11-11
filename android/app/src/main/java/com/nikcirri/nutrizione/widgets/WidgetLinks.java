package com.nikcirri.nutrizione.widgets;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import com.nikcirri.nutrizione.MainActivity;

/**
 * I tocchi sui widget che aprono l'app: l'app normale, il menu Aggiungi (il + delle calorie)
 * oppure la schermata Sigarette. WidgetsPlugin legge l'azione e avvisa l'app.
 */
final class WidgetLinks {

    static final String ACTION_ADD_MEAL = "com.nikcirri.nutrizione.widget.ADD_MEAL";
    static final String ACTION_OPEN_CIGARETTES = "com.nikcirri.nutrizione.widget.OPEN_CIGARETTES";

    private WidgetLinks() {}

    /** Apre l'app. Con `action` (una delle due sopra) la apre su quella schermata; con null la apre e basta. */
    static PendingIntent openApp(Context context, String action) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int requestCode;
        if (action == null) {
            intent.setAction(Intent.ACTION_MAIN);
            intent.addCategory(Intent.CATEGORY_LAUNCHER);
            requestCode = 0;
        } else {
            intent.setAction(action);
            requestCode = ACTION_ADD_MEAL.equals(action) ? 1 : 2;
        }
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Il nome che l'app conosce per l'azione di questo intent; null se l'intent non arriva da un widget. */
    static String appAction(Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_ADD_MEAL.equals(action)) return "addMeal";
        if (ACTION_OPEN_CIGARETTES.equals(action)) return "cigarettes";
        return null;
    }
}
