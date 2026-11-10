package com.nikcirri.nutrizione.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import com.nikcirri.nutrizione.MainActivity;
import com.nikcirri.nutrizione.R;

/**
 * Widget "Calorie rimaste" della schermata Home.
 * I numeri li manda l'app (WidgetsPlugin) ogni volta che cambiano; qui si disegnano soltanto.
 * Toccando il widget si apre l'app; toccando il + si apre direttamente il menu Aggiungi.
 */
public class CaloriesWidget extends AppWidgetProvider {

    /** Azione con cui il + apre l'app: WidgetsPlugin la riconosce e avvisa l'app. */
    static final String ACTION_ADD_MEAL = "com.nikcirri.nutrizione.widget.ADD_MEAL";

    /** Da questa larghezza (dp) c'è posto per la riga con più numeri. */
    private static final int WIDE_DP = 260;
    /** Sotto questa altezza (dp) la riga dei dettagli si nasconde. */
    private static final int SHORT_DP = 150;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id);
        WidgetActionReceiver.scheduleMidnight(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        // Il widget è stato ridimensionato: si ridisegna con la riga giusta per la nuova misura.
        render(context, manager, id);
    }

    @Override
    public void onDisabled(Context context) {
        // Tolto l'ultimo widget: se non ne restano altri, la sveglia di mezzanotte si spegne.
        WidgetActionReceiver.scheduleMidnight(context);
    }

    static int[] ids(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        return manager == null ? new int[0] : manager.getAppWidgetIds(new ComponentName(context, CaloriesWidget.class));
    }

    /** Ridisegna tutti i widget "Calorie" presenti sulla schermata Home. */
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return;
        for (int id : ids(context)) render(context, manager, id);
    }

    private static void render(Context context, AppWidgetManager manager, int id) {
        WidgetStore.Calories c = WidgetStore.calories(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_calories);

        Bundle options = manager.getAppWidgetOptions(id);
        int width = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int height = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        boolean wide = width >= WIDE_DP;
        boolean roomForDetail = height == 0 || height >= SHORT_DP;

        if (!c.known) {
            // L'app non ha ancora un obiettivo (prima apertura non fatta).
            views.setTextViewText(R.id.cal_value, "–");
            views.setTextViewText(R.id.cal_label, context.getString(R.string.widget_calories_open));
            views.setProgressBar(R.id.cal_bar, 100, 0, false);
            views.setViewVisibility(R.id.cal_detail, View.GONE);
        } else {
            boolean over = c.remaining < 0;
            // Tutto quello che si può mangiare oggi: obiettivo più l'attività, se l'utente la conta.
            int budget = Math.max(1, c.eaten + c.remaining);
            views.setTextViewText(R.id.cal_value, String.valueOf(Math.abs(c.remaining)));
            views.setTextViewText(R.id.cal_label, context.getString(over ? R.string.widget_calories_over : R.string.widget_calories_left));
            views.setProgressBar(R.id.cal_bar, budget, Math.max(0, Math.min(budget, c.eaten)), false);
            String detail;
            if (!wide) detail = context.getString(R.string.widget_calories_detail, c.eaten, budget);
            else if (c.burned > 0) detail = context.getString(R.string.widget_calories_detail_wide_burned, c.eaten, c.burned, c.goal);
            else detail = context.getString(R.string.widget_calories_detail_wide, c.eaten, c.goal);
            views.setTextViewText(R.id.cal_detail, detail);
            views.setViewVisibility(R.id.cal_detail, roomForDetail ? View.VISIBLE : View.GONE);
        }

        views.setOnClickPendingIntent(android.R.id.background, openApp(context, false));
        views.setOnClickPendingIntent(R.id.cal_add, openApp(context, true));
        manager.updateAppWidget(id, views);
    }

    /** Apre l'app; con `addMeal` la apre sul menu Aggiungi. */
    private static PendingIntent openApp(Context context, boolean addMeal) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (addMeal) {
            intent.setAction(ACTION_ADD_MEAL);
        } else {
            intent.setAction(Intent.ACTION_MAIN);
            intent.addCategory(Intent.CATEGORY_LAUNCHER);
        }
        return PendingIntent.getActivity(context, addMeal ? 1 : 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
