package com.nikcirri.nutrizione.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.util.ArrayMap;
import android.util.SizeF;
import android.widget.RemoteViews;
import com.nikcirri.nutrizione.R;
import java.util.Map;

/**
 * Widget "Sigarette" della schermata Home: il numero di oggi e i pulsanti − e +.
 * I pulsanti arrivano a WidgetActionReceiver, che cambia il numero senza aprire l'app;
 * toccando il resto del widget si apre nell'app la schermata con l'andamento.
 * Due disegni: quello normale (da 2×2 in su) e quello basso (una riga, 2×1).
 */
public class CigaretteWidget extends AppWidgetProvider {

    /** Da questa altezza (dp) si usa il disegno normale; sotto, quello basso. */
    private static final float TALL_DP = 125f;
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
        return manager == null ? new int[0] : manager.getAppWidgetIds(new ComponentName(context, CigaretteWidget.class));
    }

    /** Ridisegna tutti i widget "Sigarette" presenti sulla schermata Home. */
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return;
        for (int id : ids(context)) render(context, manager, id);
    }

    private static void render(Context context, AppWidgetManager manager, int id) {
        int count = WidgetStore.cigarettes(context);
        RemoteViews views;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Da Android 12 si consegnano tutti e due i disegni: la schermata Home sceglie quello adatto alla misura.
            Map<SizeF, RemoteViews> sizes = new ArrayMap<>();
            sizes.put(new SizeF(MIN_DP, MIN_DP), build(context, count, true));
            sizes.put(new SizeF(MIN_DP, TALL_DP), build(context, count, false));
            views = new RemoteViews(sizes);
        } else {
            Bundle options = manager.getAppWidgetOptions(id);
            int height = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            views = build(context, count, height > 0 && height < TALL_DP);
        }
        manager.updateAppWidget(id, views);
    }

    private static RemoteViews build(Context context, int count, boolean small) {
        RemoteViews views = new RemoteViews(context.getPackageName(), small ? R.layout.widget_cigarettes_small : R.layout.widget_cigarettes);
        views.setTextViewText(R.id.cig_count, String.valueOf(count));
        views.setContentDescription(R.id.cig_count, context.getString(R.string.widget_cig_count, count));
        views.setOnClickPendingIntent(R.id.cig_minus, WidgetActionReceiver.pending(context, WidgetActionReceiver.ACTION_CIG_MINUS));
        views.setOnClickPendingIntent(R.id.cig_plus, WidgetActionReceiver.pending(context, WidgetActionReceiver.ACTION_CIG_PLUS));
        views.setOnClickPendingIntent(android.R.id.background, WidgetLinks.openApp(context, WidgetLinks.ACTION_OPEN_CIGARETTES));
        return views;
    }
}
