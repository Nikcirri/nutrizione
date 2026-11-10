package com.nikcirri.nutrizione.widgets;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.LocalDate;
import java.util.Map;

/**
 * Dati dei widget, salvati sul telefono fuori dal database dell'app: così i widget funzionano
 * anche quando l'app è chiusa.
 * - Calorie: gli ultimi numeri della giornata mandati dall'app.
 * - Sigarette: un numero per ogni giorno (chiave "cig_AAAA-MM-GG").
 */
final class WidgetStore {

    private static final String PREFS = "widgets";
    private static final String CAL_DATE = "cal_date";
    private static final String CAL_GOAL = "cal_goal";
    private static final String CAL_EATEN = "cal_eaten";
    private static final String CAL_BURNED = "cal_burned";
    private static final String CAL_REMAINING = "cal_remaining";
    private static final String CIG_PREFIX = "cig_";
    /** Oltre questo numero di giorni i conteggi vecchi delle sigarette si cancellano. */
    private static final int KEEP_DAYS = 400;
    private static final int MAX_CIGARETTES = 999;

    private WidgetStore() {}

    /** I numeri di oggi per il widget "Calorie". */
    static final class Calories {

        /** Falso finché l'app non ha mai mandato un obiettivo (app appena installata). */
        final boolean known;
        final int goal;
        final int eaten;
        final int burned;
        /** Negativo se si è andati oltre l'obiettivo. */
        final int remaining;

        Calories(boolean known, int goal, int eaten, int burned, int remaining) {
            this.known = known;
            this.goal = goal;
            this.eaten = eaten;
            this.burned = burned;
            this.remaining = remaining;
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Il giorno di oggi come lo scrive l'app: AAAA-MM-GG. */
    static String today() {
        return LocalDate.now().toString();
    }

    static void saveCalories(Context context, String date, int goal, int eaten, int burned, int remaining) {
        prefs(context)
            .edit()
            .putString(CAL_DATE, date)
            .putInt(CAL_GOAL, goal)
            .putInt(CAL_EATEN, eaten)
            .putInt(CAL_BURNED, burned)
            .putInt(CAL_REMAINING, remaining)
            .apply();
    }

    /**
     * I numeri da mostrare adesso. Se gli ultimi numeri salvati sono di un altro giorno (oggi l'app
     * non è ancora stata aperta) la giornata è nuova: non si è mangiato niente e resta tutto l'obiettivo.
     */
    static Calories calories(Context context) {
        SharedPreferences p = prefs(context);
        int goal = p.getInt(CAL_GOAL, 0);
        if (goal <= 0) return new Calories(false, 0, 0, 0, 0);
        if (!today().equals(p.getString(CAL_DATE, ""))) return new Calories(true, goal, 0, 0, goal);
        return new Calories(true, goal, p.getInt(CAL_EATEN, 0), p.getInt(CAL_BURNED, 0), p.getInt(CAL_REMAINING, goal));
    }

    /** Le sigarette di oggi. */
    static int cigarettes(Context context) {
        return prefs(context).getInt(CIG_PREFIX + today(), 0);
    }

    /** Aggiunge o toglie sigarette a oggi (mai sotto zero) e restituisce il nuovo numero. */
    static int changeCigarettes(Context context, int delta) {
        SharedPreferences p = prefs(context);
        String key = CIG_PREFIX + today();
        int value = Math.max(0, Math.min(MAX_CIGARETTES, p.getInt(key, 0) + delta));
        // commit: il numero è salvato prima che il widget venga ridisegnato, anche se Android chiude subito il processo.
        p.edit().putInt(key, value).commit();
        return value;
    }

    /** Cancella i conteggi delle sigarette più vecchi di KEEP_DAYS giorni. */
    static void prune(Context context) {
        SharedPreferences p = prefs(context);
        String oldest = CIG_PREFIX + LocalDate.now().minusDays(KEEP_DAYS);
        SharedPreferences.Editor editor = null;
        for (Map.Entry<String, ?> entry : p.getAll().entrySet()) {
            String key = entry.getKey();
            // Le date AAAA-MM-GG si confrontano bene anche come testo.
            if (key.startsWith(CIG_PREFIX) && key.compareTo(oldest) < 0) {
                if (editor == null) editor = p.edit();
                editor.remove(key);
            }
        }
        if (editor != null) editor.apply();
    }
}
