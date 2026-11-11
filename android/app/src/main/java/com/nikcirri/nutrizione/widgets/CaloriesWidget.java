package com.nikcirri.nutrizione.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.util.ArrayMap;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import com.nikcirri.nutrizione.R;
import java.util.Map;

/**
 * Widget "Calorie rimaste" della schermata Home.
 * I numeri li manda l'app (WidgetsPlugin) ogni volta che cambiano; qui si disegnano soltanto.
 * Toccando il widget si apre l'app; toccando il + si apre direttamente il menu Aggiungi.
 * Due disegni: quello normale (da 2×2 in su) e quello basso (una riga, 2×1).
 */
public class CaloriesWidget extends AppWidgetProvider {

    /** Da questa larghezza (dp) c'è posto per la riga con più numeri. */
    private static final float WIDE_DP = 250f;
    /** Da questa altezza (dp) si usa il disegno normale; sotto, quello basso. */
    private static final float TALL_DP = 140f;
    private static final float MIN_DP = 40f;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id);
        WidgetActionReceiver.scheduleMidnight(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        // Il widget è stato ridimensionato: si ridisegna per la nuova misura.
        render(context, manager, id);
    }

    @Override
    public void onDisabled(Context context) {
        // Tolto l'ultimo widget: se non ne restano altri, le sveglie di mezzanotte si spengono.
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
        RemoteViews views;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Da Android 12 si consegnano tutti i disegni: la schermata Home sceglie da sola
            // quello adatto alla misura del widget, anche mentre lo si ridimensiona.
            Map<SizeF, RemoteViews> sizes = new ArrayMap<>();
            sizes.put(new SizeF(MIN_DP, MIN_DP), build(context, c, true, false));
            sizes.put(new SizeF(WIDE_DP, MIN_DP), build(context, c, true, true));
            sizes.put(new SizeF(MIN_DP, TALL_DP), build(context, c, false, false));
            sizes.put(new SizeF(WIDE_DP, TALL_DP), build(context, c, false, true));
            views = new RemoteViews(sizes);
        } else {
            // Android più vecchi: si sceglie qui, dalla misura che comunica la schermata Home.
            Bundle options = manager.getAppWidgetOptions(id);
            int width = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            int height = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            views = build(context, c, height > 0 && height < TALL_DP, width >= WIDE_DP);
        }
        manager.updateAppWidget(id, views);
    }

    /** Un disegno del widget: `small` per il formato basso, `wide` quando c'è posto per più numeri. */
    private static RemoteViews build(Context context, WidgetStore.Calories c, boolean small, boolean wide) {
        RemoteViews views = new RemoteViews(context.getPackageName(), small ? R.layout.widget_calories_small : R.layout.widget_calories);

        if (!c.known) {
            // L'app non ha ancora un obiettivo (prima apertura non fatta).
            views.setTextViewText(R.id.cal_value, "–");
            views.setTextViewText(R.id.cal_label, context.getString(R.string.widget_calories_open));
            views.setProgressBar(R.id.cal_bar, 100, 0, false);
            if (!small) views.setViewVisibility(R.id.cal_detail, View.GONE);
        } else {
            boolean over = c.remaining < 0;
            // Tutto quello che si può mangiare oggi: obiettivo più l'attività, se l'utente la conta.
            int budget = Math.max(1, c.eaten + c.remaining);
            views.setTextViewText(R.id.cal_value, String.valueOf(Math.abs(c.remaining)));
            views.setProgressBar(R.id.cal_bar, budget, Math.max(0, Math.min(budget, c.eaten)), false);
            if (small) {
                // Formato basso: una sola riga di testo; se è largo ci sta anche "mangiate di totale".
                String label;
                if (wide) label = context.getString(over ? R.string.widget_calories_over_detail : R.string.widget_calories_left_detail, c.eaten, budget);
                else label = context.getString(over ? R.string.widget_calories_over : R.string.widget_calories_left);
                views.setTextViewText(R.id.cal_label, label);
            } else {
                views.setTextViewText(R.id.cal_label, context.getString(over ? R.string.widget_calories_over : R.string.widget_calories_left));
                String detail;
                if (!wide) detail = context.getString(R.string.widget_calories_detail, c.eaten, budget);
                else if (c.burned > 0) detail = context.getString(R.string.widget_calories_detail_wide_burned, c.eaten, c.burned, c.goal);
                else detail = context.getString(R.string.widget_calories_detail_wide, c.eaten, c.goal);
                views.setTextViewText(R.id.cal_detail, detail);
                views.setViewVisibility(R.id.cal_detail, View.VISIBLE);
            }
        }

        views.setOnClickPendingIntent(android.R.id.background, WidgetLinks.openApp(context, null));
        views.setOnClickPendingIntent(R.id.cal_add, WidgetLinks.openApp(context, WidgetLinks.ACTION_ADD_MEAL));
        return views;
    }
}
