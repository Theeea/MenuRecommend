import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../auth/authStore";

import LoginScreen from "../screens/LoginScreen";
import IngredientsScreen from "../screens/IngredientsScreen";
import RecommendScreen from "../screens/RecommendScreen";
import ProofScreen from "../screens/ProofScreen";

export type AppStackParamList = {
    Ingredients: undefined;
    Recommend: undefined;
    Proof: { sessionId: string };
};

const Stack = createNativeStackNavigator();
const AppStack = createNativeStackNavigator<AppStackParamList>();

function AppNavigator() {
    return (
        <AppStack.Navigator>
            <AppStack.Screen name="Ingredients" component={IngredientsScreen} options={{ title: "싫어하는 재료" }} />
            <AppStack.Screen name="Recommend" component={RecommendScreen} options={{ title: "추천" }} />
            <AppStack.Screen name="Proof" component={ProofScreen} options={{ title: "인증" }} />
        </AppStack.Navigator>
    );
}

export default function RootNavigator() {
    const { token, loading } = useAuth();
    if (loading) return null;

    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {token ? (
                    <Stack.Screen name="App" component={AppNavigator} />
                ) : (
                    <Stack.Screen name="Auth" component={LoginScreen} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}
