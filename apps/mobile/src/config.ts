import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * ✅ 실기기면 localhost가 "폰 자신"을 가리켜서 API가 안 붙음.
 * - 가장 안전: EXPO_PUBLIC_API_BASE_URL 로 지정
 * - iOS Simulator: localhost 가능
 * - Android Emulator: 10.0.2.2
 */
const envBase = process.env.EXPO_PUBLIC_API_BASE_URL;

const defaultBase =
    Platform.OS === "android"
        ? "http://10.0.2.2:3000"
        : "http://localhost:3000";

const extraBase =
    (Constants.expoConfig?.extra as any)?.apiBaseUrl ??
    (Constants.manifest as any)?.extra?.apiBaseUrl;

export const API_BASE_URL = (envBase || extraBase || defaultBase).replace(/\/$/, "");
