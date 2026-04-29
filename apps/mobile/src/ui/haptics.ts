import * as Haptics from "expo-haptics";

export async function hTap() {
    try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
}

export const hapticTap = hTap;

export async function hSuccess() {
    try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
}

export async function hWarn() {
    try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {}
}

export async function hError() {
    try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {}
}
