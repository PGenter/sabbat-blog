// Dialog "Benachrichtigungen": Gerät an-/abmelden und Arten ein-/ausschalten

import { getCurrentLanguage, t } from "./i18n.ts";
import {
  DEFAULT_SETTINGS,
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  getDeviceSubscription,
  getPermission,
  getPushSupport,
  loadNotificationSettings,
  saveNotificationSettings,
  type NotificationKind,
  type NotificationSettings,
} from "./notifications.ts";

const KIND_LABELS: Record<NotificationKind, Parameters<typeof t>[0]> = {
  new_entry: "notifyNewEntry",
  new_comment: "notifyNewComment",
  comment_reply: "notifyCommentReply",
  comment_reaction: "notifyCommentReaction",
};

export function setupNotificationSettings(options: {
  userId: string;
  role: string;
  onDeviceStateChange?: (enabled: boolean) => void;
}) {
  const section = document.getElementById("notification-section")!;
  const deviceSwitch = document.getElementById(
    "notify-device",
  ) as HTMLInputElement;
  const deviceHint = document.getElementById("notify-device-hint")!;
  const kindSwitches = [
    ...section.querySelectorAll<HTMLInputElement>("[data-notify-kind]"),
  ];

  // Neue Kommentare gibt es nur für Administratoren und Superuser
  const isStaff = options.role === "administrator" || options.role === "superuser";
  section
    .querySelectorAll<HTMLElement>("[data-notify-staff]")
    .forEach((el) => (el.hidden = !isStaff));

  let settings: NotificationSettings = { ...DEFAULT_SETTINGS };
  let busy = false;
  let lastError: string | null = null;

  function renderDevice(enabled: boolean) {
    deviceSwitch.checked = enabled;
    const support = getPushSupport();
    const permission = getPermission();

    let hint: string;
    if (lastError) hint = lastError;
    else if (support === "ios-needs-install") hint = t("notifyIosInstall");
    else if (support === "unsupported") hint = t("notifyUnsupported");
    else if (support === "missing-key") hint = t("notifyMissingKey");
    else if (permission === "denied") hint = t("notifyDenied");
    else hint = enabled ? t("notifyDeviceOn") : t("notifyDeviceOff");

    deviceHint.textContent = hint;
    deviceSwitch.disabled =
      busy || support !== "supported" || (permission === "denied" && !enabled);
    options.onDeviceStateChange?.(enabled);
  }

  function renderKinds() {
    for (const input of kindSwitches) {
      const kind = input.dataset.notifyKind as NotificationKind;
      input.checked = settings[kind];
    }
  }

  async function refresh() {
    lastError = null;
    const [subscription, loaded] = await Promise.all([
      getDeviceSubscription(),
      loadNotificationSettings(),
    ]);
    settings = loaded;
    renderKinds();
    renderDevice(!!subscription && getPermission() === "granted");
  }

  deviceSwitch.addEventListener("change", async () => {
    const wanted = deviceSwitch.checked;
    busy = true;
    lastError = null;
    renderDevice(wanted);
    try {
      if (wanted) {
        await enablePushOnThisDevice(getCurrentLanguage());
      } else {
        await disablePushOnThisDevice();
      }
    } catch (error) {
      console.error("Benachrichtigungen umschalten fehlgeschlagen:", error);
      const message = error instanceof Error ? error.message : "";
      lastError =
        message === "permission-denied"
          ? t("notifyDenied")
          : message === "push-unsupported"
            ? t("notifyUnsupported")
            : t("notifyError");
    }
    busy = false;
    const subscription = await getDeviceSubscription();
    renderDevice(!!subscription && getPermission() === "granted");
  });

  for (const input of kindSwitches) {
    input.addEventListener("change", async () => {
      const kind = input.dataset.notifyKind as NotificationKind;
      const previous = settings[kind];
      settings = { ...settings, [kind]: input.checked };
      try {
        await saveNotificationSettings(options.userId, settings);
      } catch (error) {
        console.error("Einstellung konnte nicht gespeichert werden:", error);
        settings = { ...settings, [kind]: previous };
        input.checked = previous;
      }
    });
  }

  function applyTranslations() {
    const title = document.getElementById("notify-title");
    if (title) title.textContent = t("notifications");
    const deviceLabel = document.getElementById("notify-device-label");
    if (deviceLabel) deviceLabel.textContent = t("notifyDevice");
    const kindsTitle = document.getElementById("notify-kinds-title");
    if (kindsTitle) kindsTitle.textContent = t("notifyKindsTitle");
    const footnote = document.getElementById("notify-footnote");
    if (footnote) footnote.textContent = t("notifyFootnote");
    section
      .querySelectorAll<HTMLElement>("[data-notify-label]")
      .forEach((el) => {
        const kind = el.dataset.notifyLabel as NotificationKind;
        el.textContent = t(KIND_LABELS[kind]);
      });
    renderDevice(deviceSwitch.checked);
  }

  return { refresh, applyTranslations };
}
