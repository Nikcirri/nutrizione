package com.nikcirri.nutrizione.widgets;

import android.content.Context;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Collega l'app ai widget della schermata Home:
 * - `setCalories`: l'app manda i numeri di oggi e il widget "Calorie" si ridisegna;
 * - evento `widgetAction`: avvisa l'app quando viene aperta dal + del widget "Calorie".
 */
@CapacitorPlugin(name = "Widgets")
public class WidgetsPlugin extends Plugin {

    @Override
    public void load() {
        // A ogni apertura dell'app i widget si rimettono in pari (giorno giusto, sveglia di mezzanotte attiva).
        Context context = getContext().getApplicationContext();
        CaloriesWidget.updateAll(context);
        CigaretteWidget.updateAll(context);
        WidgetActionReceiver.scheduleMidnight(context);
    }

    /** Capacitor chiama questo metodo sia all'avvio dell'app sia quando l'app già aperta riceve un nuovo intent. */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || !CaloriesWidget.ACTION_ADD_MEAL.equals(intent.getAction())) return;
        // App riaperta dalle app recenti: l'intent è quello vecchio, il + non è stato toccato adesso.
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;
        // Segnato come già gestito, così non si ripete.
        intent.setAction(Intent.ACTION_MAIN);
        JSObject data = new JSObject();
        data.put("action", "addMeal");
        // "true": se l'app si sta ancora avviando, l'avviso resta in attesa finché non è pronta ad ascoltarlo.
        notifyListeners("widgetAction", data, true);
    }

    @PluginMethod
    public void setCalories(PluginCall call) {
        String date = call.getString("date");
        JSObject data = call.getData();
        double goal = data.optDouble("goal", Double.NaN);
        double eaten = data.optDouble("eaten", Double.NaN);
        double burned = data.optDouble("burned", Double.NaN);
        double remaining = data.optDouble("remaining", Double.NaN);
        if (date == null || !date.matches("\\d{4}-\\d{2}-\\d{2}") || Double.isNaN(goal) || Double.isNaN(eaten) || Double.isNaN(burned) || Double.isNaN(remaining)) {
            call.reject("Dati del widget non validi");
            return;
        }
        Context context = getContext().getApplicationContext();
        WidgetStore.saveCalories(context, date, (int) Math.round(goal), (int) Math.round(eaten), (int) Math.round(burned), (int) Math.round(remaining));
        CaloriesWidget.updateAll(context);
        call.resolve();
    }
}
