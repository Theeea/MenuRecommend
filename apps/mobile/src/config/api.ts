import Constants from "expo-constants";

/**
 * ✅ 실기기에서 localhost는 "폰 자기 자신"이라 API가 안 붙음.
 * Expo가 띄운 개발 서버 host(ip)를 가져와서 API_BASE_URL을 자동 구성한다.
 *
 * 우선순위:
 * 1) EXPO_PUBLIC_API_BASE_URL (환경변수)
 * 2) Expo host ip 기반 http://{host}:3000
 * 3) http://localhost:3000 (시뮬레이터/웹 등 fallback)
 */

function getExpoHost(): string | null {
    // SDK별로 host 정보가 다르게 들어올 수 있어 여러 케이스를 커버
    const anyConst: any = Constants as any;

    const hostUri: string | undefined =
        Constants.expoConfig?.hostUri ||
        anyConst?.manifest2?.extra?.expoClient?.hostUri ||
        anyConst?.manifest?.hostUri ||
        anyConst?.manifest?.debuggerHost; // e.g. "192.168.0.12:19000"

    if (!hostUri) return null;

    // "192.168.0.12:19000" or "192.168.0.12"
    const host = hostUri.split(":")[0];
    return host || null;
}

const envBase = process.env.EXPO_PUBLIC_API_BASE_URL;
const host = getExpoHost();

export const API_BASE_URL =
    envBase ||
    (host ? `http://${host}:3000` : "http://localhost:3000");
