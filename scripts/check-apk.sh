#!/usr/bin/env bash
# Controlla l'APK finito (dopo la build Android, in GitHub Actions):
#  - Health Connect: solo le letture che l'app usa, nessuna scrittura (anche se una libreria ne aggiunge);
#  - scrive la dimensione dell'APK e delle parti più pesanti nel riepilogo della build.
# Uso: scripts/check-apk.sh percorso/app.apk
set -euo pipefail

APK="$1"
ALLOWED="READ_STEPS READ_DISTANCE READ_ACTIVE_CALORIES_BURNED READ_TOTAL_CALORIES_BURNED READ_EXERCISE"

BUILD_TOOLS=$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -n 1)
AAPT2="${BUILD_TOOLS}aapt2"

PERMS=$("$AAPT2" dump permissions "$APK")
HEALTH=$(grep -o "android.permission.health.[A-Z0-9_]*" <<< "$PERMS" | sed 's/android.permission.health.//' | sort -u || true)

BAD=""
for p in $HEALTH; do
  if [[ " $ALLOWED " != *" $p "* ]]; then BAD="$BAD $p"; fi
done

SIZE=$(du -k "$APK" | cut -f1)
{
  echo "### APK"
  echo "- Dimensione: $((SIZE / 1024)) MB ($SIZE KB)"
  echo "- Permessi di Health Connect: $(echo $HEALTH)"
  echo ""
  echo "Parti più pesanti:"
  echo '```'
  # awk legge tutto (con "head" sort si interromperebbe con un errore).
  unzip -l "$APK" | sort -k1 -n -r | awk 'NR <= 12'
  echo '```'
} >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"

if [ -n "$BAD" ]; then
  echo "::error title=Permessi di Health Connect non previsti::$BAD (toglili in android/app/src/main/AndroidManifest.xml con tools:node=\"remove\")"
  exit 1
fi
echo "APK controllato: $((SIZE / 1024)) MB, Health Connect:$(echo " $HEALTH")"
