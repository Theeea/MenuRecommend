import axios from "axios";
import { API_BASE_URL } from "../config";
import { getToken, clearToken } from "../auth/authStore";

export const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
});

api.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (res) => res,
    async (err) => {
        const status = err?.response?.status;

        // 토큰 만료/비정상 시 개발 단계에서는 토큰만 날리고 UI에서 다시 로그인 유도
        if (status === 401) {
            await clearToken();
        }

        return Promise.reject(err);
    },
);
