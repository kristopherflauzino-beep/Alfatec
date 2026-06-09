import "react-native-get-random-values";
import { registerRootComponent } from "expo";

const AppEntry = process.env.EXPO_PUBLIC_APP_TARGET === "v2"
  ? require("./src/v2/AppV2").default
  : require("./App").default;

registerRootComponent(AppEntry);
