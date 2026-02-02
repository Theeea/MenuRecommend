import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type IngredientsState = {
    selectedIngredientIds: string[];
    setSelectedIngredientIds: (ids: string[]) => void;
    toggleIngredient: (id: string) => void;
    reset: () => void;
};

export const useIngredientsStore = create<IngredientsState>()(
    persist(
        (set, get) => ({
            selectedIngredientIds: [],

            setSelectedIngredientIds: (ids) => set({ selectedIngredientIds: ids }),

            toggleIngredient: (id) => {
                const cur = get().selectedIngredientIds;
                const has = cur.includes(id);
                set({
                    selectedIngredientIds: has ? cur.filter((v) => v !== id) : [...cur, id],
                });
            },

            reset: () => set({ selectedIngredientIds: [] }),
        }),
        {
            name: "ingredients-store",
            storage: createJSONStorage(() => AsyncStorage),
            version: 1,
        }
    )
);
