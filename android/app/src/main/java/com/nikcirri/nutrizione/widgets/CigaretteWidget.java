package com.nikcirri.nutrizione.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.widget.RemoteViews;
import com.nikcirri.nutrizione.R;

/**
 * Widget "Sigarette" della schermata Home: il numero di oggi e i pulsanti − e +.
 * I tocchi arrivano a WidgetActionReceiver, che cambia il numero senza aprire l'app.
 */
public class CigaretteWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id);
        WidgetActionReceiver.scheduleMidnight(context);
    }

    @Override
    public void onDisabled(Context context) {
        // Tolto l'ultimo widget: se non ne restano altri, la sveglia di mezzanotte si spegne.
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
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_cigarettes);
        views.setTextViewText(R.id.cig_count, String.valueOf(count));
        views.setContentDescription(R.id.cig_count, context.getString(R.string.widget_cig_count, count));
        views.setOnClickPendingIntent(R.id.cig_minus, WidgetActionReceiver.pending(context, WidgetActionReceiver.ACTION_CIG_MINUS));
        views.setOnClickPendingIntent(R.id.cig_plus, WidgetActionReceiver.pending(context, WidgetActionReceiver.ACTION_CIG_PLUS));
        manager.updateAppWidget(id, views);
    }
}
