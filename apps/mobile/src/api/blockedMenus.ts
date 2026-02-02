import { api } from "./client";

export type BlockedMenuRow = {
    id: string;
    menuId: string;
    createdAt: string;
    menu?: {
        id: string;
        name?: string;
        title?: string;
    };
};

export async function apiGetBlockedMenus(params?: { cursor?: string | null; take?: number }) {
    const { cursor = null, take = 30 } = params ?? {};
    const res = await api.get("/me/blocked-menus", {
        params: { take, ...(cursor ? { cursor } : {}) },
    });
    return res.data as { ok: true; data: BlockedMenuRow[]; nextCursor: string | null };
}

export async function apiAddBlockedMenu(menuId: string) {
    const res = await api.post(`/me/blocked-menus/${menuId}`);
    return res.data;
}

export async function apiRemoveBlockedMenu(menuId: string) {
    const res = await api.delete(`/me/blocked-menus/${menuId}`);
    return res.data;
}

export async function apiResetBlockedMenus() {
    const res = await api.delete(`/me/blocked-menus`);
    return res.data as { ok: true; deleted: number };
}
