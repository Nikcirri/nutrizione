package com.nikcirri.nutrizione.widgets;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Riceve i tocchi sui pulsanti − e + del widget "Sigarette" e il segnale di mezzanotte.
 * Non è raggiungibile da altre app (exported="false" nel manifest): solo da questa app e da Android.
 */
public class WidgetActionReceiver extends BroadcastReceiver {

    static final String ACTION_CIG_PLUS = "com.nikcirri.nutrizione.widget.CIG_PLUS";
    static final String ACTION_CIG_MINUS = "com.nikcirri.nutrizione.widget.CIG_MINUS";
    /** Giorno cambiato: i widget passano alla giornata nuova. */
    static final String ACTION_REFRESH = "com.nikcirri.nutrizione.widget.REFRESH";

    private static final long TEN_MINUTES = 10 * 60 * 1000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_CIG_PLUS.equals(action)) {
            WidgetStore.changeCigarettes(context, 1);
        } else if (ACTION_CIG_MINUS.equals(action)) {
            WidgetStore.changeCigarettes(context, -1);
        } else {
            // Mezzanotte passata, oppure ora o fuso orario cambiati.
            WidgetStore.prune(context);
        }
        // Si ridisegnano sempre tutti e due: se nel frattempo è cambiato giorno, si aggiornano insieme.
        CigaretteWidget.updateAll(context);
        CaloriesWidget.updateAll(context);
        scheduleMidnight(context);
    }

    /** Intent verso questo ricevitore, da collegare a un pulsante di un widget o a una sveglia. */
    static PendingIntent pending(Context context, String action) {
        Intent intent = new Intent(context, WidgetActionReceiver.class);
        intent.setAction(action);
        // Consegna con priorità: il numero cambia subito dopo il tocco.
        intent.addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Prepara l'aggiornamento dei widget per la prossima mezzanotte, quando la giornata riparte da zero.
     * È una sveglia che NON accende il telefono: se a mezzanotte lo schermo è spento, i widget si
     * aggiornano appena il telefono si risveglia. Senza widget sulla schermata Home la sveglia si spegne.
     */
    static void scheduleMidnight(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent refresh = pending(context, ACTION_REFRESH);
        if (CaloriesWidget.ids(context).length == 0 && CigaretteWidget.ids(context).length == 0) {
            alarms.cancel(refresh);
            return;
        }
        long midnight = LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
        alarms.setWindow(AlarmManager.RTC, midnight + 1000L, TEN_MINUTES, refresh);
    }
}
