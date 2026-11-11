package com.nikcirri.nutrizione.widgets;

import android.content.Context;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * Collega l'app ai widget della schermata Home:
 * - `setCalories`: l'app manda i numeri di oggi e il widget "Calorie" si ridisegna;
 * - `getCigarettes`, `changeCigarettes`, `setCigarettes`: il contatore di sigarette, che vive qui sul telefono;
 * - evento `widgetAction`: avvisa l'app quando viene aperta toccando un widget.
 */
@CapacitorPlugin(name = "Widgets")
public class WidgetsPlugin extends Plugin {

    @Override
    public void load() {
        // A ogni apertura dell'app i widget si rimettono in pari (giorno giusto, sveglie di mezzanotte attive).
        Context context = getContext().getApplicationContext();
        CaloriesWidget.updateAll(context);
        CigaretteWidget.updateAll(context);
        WidgetActionReceiver.scheduleMidnight(context);
    }

    /** Capacitor chiama questo metodo sia all'avvio dell'app sia quando l'app già aperta riceve un nuovo intent. */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String action = WidgetLinks.appAction(intent);
        if (action == null) return;
        // App riaperta dalle app recenti: l'intent è quello vecchio, il widget non è stato toccato adesso.
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;
        // Segnato come già gestito, così non si ripete.
        intent.setAction(Intent.ACTION_MAIN);
        JSObject data = new JSObject();
        data.put("action", action);
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

    /** Tutti i conteggi delle sigarette: { days: { "AAAA-MM-GG": numero } }. */
    @PluginMethod
    public void getCigarettes(PluginCall call) {
        JSObject days = new JSObject();
        for (Map.Entry<String, Integer> entry : WidgetStore.allCigarettes(getContext().getApplicationContext()).entrySet()) {
            days.put(entry.getKey(), entry.getValue());
        }
        JSObject result = new JSObject();
        result.put("days", days);
        call.resolve(result);
    }

    /** Aggiunge o toglie sigarette a un giorno (oggi o un giorno passato) e restituisce il nuovo numero. */
    @PluginMethod
    public void changeCigarettes(PluginCall call) {
        String date = call.getString("date");
        int delta = call.getData().optInt("delta", 0);
        if (!WidgetStore.isPastOrToday(date) || delta == 0 || Math.abs(delta) > 100) {
            call.reject("Conteggio non valido");
            return;
        }
        Context context = getContext().getApplicationContext();
        int count = WidgetStore.changeCigarettes(context, date, delta);
        CigaretteWidget.updateAll(context);
        JSObject result = new JSObject();
        result.put("count", count);
        call.resolve(result);
    }

    /** Sostituisce tutti i conteggi delle sigarette (ripristino di un backup). */
    @PluginMethod
    public void setCigarettes(PluginCall call) {
        JSObject days = call.getObject("days");
        if (days == null) {
            call.reject("Conteggi mancanti");
            return;
        }
        Map<String, Integer> values = new HashMap<>();
        for (Iterator<String> keys = days.keys(); keys.hasNext();) {
            String key = keys.next();
            double value = days.optDouble(key, Double.NaN);
            if (!Double.isNaN(value)) values.put(key, (int) Math.round(value));
        }
        Context context = getContext().getApplicationContext();
        WidgetStore.replaceCigarettes(context, values);
        CigaretteWidget.updateAll(context);
        call.resolve();
    }
}
