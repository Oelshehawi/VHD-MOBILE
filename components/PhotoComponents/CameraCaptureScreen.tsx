import { useState, useRef, useEffect, useCallback } from "react";
import {
    View,
    Alert,
    TouchableOpacity,
    Text as RNText,
    Dimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Text } from "@/components/ui/text";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

interface CameraCaptureScreenProps {
    onPhotoCaptured: (uri: string) => void;
    capturedCount: number;
    onDone: () => void;
    onClose: () => void;
    type: "before" | "after";
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const CAMERA_HEIGHT = SCREEN_WIDTH * (4 / 3);

export function CameraCaptureScreen({
    onPhotoCaptured,
    capturedCount,
    onDone,
    onClose,
    type,
}: CameraCaptureScreenProps) {
    const [facing, setFacing] = useState<"front" | "back">("back");
    const [flash, setFlash] = useState<"off" | "on" | "auto">("off");
    const [permission, requestPermission] = useCameraPermissions();
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [zoom, setZoom] = useState(0);
    const zoomShared = useSharedValue(0); // Shared value for worklet access
    const startZoom = useSharedValue(0); // Track zoom at pinch start
    const cameraRef = useRef<CameraView>(null);
    const insets = useSafeAreaInsets();

    // Use ref to track capture state without causing re-renders
    const captureStateRef = useRef({
        isCameraReady: false,
        capturedCount: 0,
        isCapturing: false,
    });

    // Keep ref in sync with state
    useEffect(() => {
        captureStateRef.current.isCameraReady = isCameraReady;
        captureStateRef.current.capturedCount = capturedCount;
    }, [isCameraReady, capturedCount]);

    const handleTakePicture = useCallback(async () => {
        const { isCameraReady: ready, isCapturing } = captureStateRef.current;

        if (!cameraRef.current || !ready) {
            return;
        }

        if (isCapturing) {
            return;
        }

        try {
            captureStateRef.current.isCapturing = true;

            const photo = await cameraRef.current.takePictureAsync({
                quality: 1,
                exif: true,
                skipProcessing: false,
            });

            if (photo?.uri) {
                onPhotoCaptured(photo.uri);
            }
        } catch (error) {
            console.error("Capture error:", error);
            Alert.alert("Capture Failed", "Unable to take photo.", [
                { text: "OK" },
            ]);
        } finally {
            captureStateRef.current.isCapturing = false;
        }
    }, [onPhotoCaptured]);

    const handleCameraReady = () => {
        setIsCameraReady(true);
    };

    const toggleFacing = () => {
        setFacing((current) => (current === "back" ? "front" : "back"));
        setZoom(0);
        zoomShared.value = 0;
    };

    const toggleFlash = () => {
        setFlash((current) => {
            if (current === "off") return "on";
            if (current === "on") return "auto";
            return "off";
        });
    };

    // Pinch to zoom - maintains state between pinches
    const updateZoom = useCallback(
        (newZoom: number) => {
            setZoom(newZoom);
            zoomShared.value = newZoom; // Keep shared value in sync
        },
        [zoomShared],
    );

    const pinchGesture = Gesture.Pinch()
        .onStart(() => {
            "worklet";
            // Capture current zoom when pinch starts
            startZoom.value = zoomShared.value;
        })
        .onUpdate((event) => {
            "worklet";
            // Add scale delta to starting zoom, clamped 0-1
            const newZoom = Math.min(
                Math.max(startZoom.value + (event.scale - 1) * 0.5, 0),
                1,
            );
            scheduleOnRN(updateZoom, newZoom);
        });

    // Loading state
    if (!permission) {
        return (
            <View className="flex-1 justify-center items-center bg-black p-6">
                <RNText className="text-white text-2xl font-semibold text-center">
                    Loading Camera...
                </RNText>
            </View>
        );
    }

    // Permission not granted - FIX: Use explicit styling for buttons
    if (!permission.granted) {
        return (
            <View className="flex-1 justify-center items-center bg-black p-6">
                <Ionicons name="camera-outline" size={64} color="#9CA3AF" />
                <RNText className="text-white text-2xl font-semibold text-center mb-4 mt-6">
                    Camera Permission Required
                </RNText>
                <RNText className="text-gray-400 text-sm text-center mb-8 px-4">
                    Enable camera access to capture photos of work completed.
                </RNText>
                {/* FIX: Explicit background color instead of relying on Button variant */}
                <TouchableOpacity
                    onPress={requestPermission}
                    style={{ backgroundColor: "#3B82F6" }}
                    className="px-8 py-3 rounded-lg mb-3"
                >
                    <RNText className="text-white font-semibold text-base">
                        Enable Camera
                    </RNText>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={onClose}
                    className="px-8 py-3 rounded-lg border border-gray-600"
                >
                    <RNText className="text-gray-300 font-semibold text-base">
                        Cancel
                    </RNText>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: "black" }}>
            <View style={{ flex: 1, backgroundColor: "black" }}>
                {/* Top Controls */}
                <View
                    style={{
                        height: insets.top + 60,
                        paddingTop: insets.top,
                        backgroundColor: "black",
                        zIndex: 10,
                    }}
                    className="flex-row justify-between items-center px-4"
                >
                    {/* Close Button */}
                    <TouchableOpacity
                        onPress={onClose}
                        className="w-10 h-10 items-center justify-center"
                    >
                        <Ionicons name="close" size={28} color="white" />
                    </TouchableOpacity>

                    {/* Flash Toggle */}
                    <TouchableOpacity
                        onPress={toggleFlash}
                        className="flex-row items-center px-3 py-2 rounded-full"
                        style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
                    >
                        <Ionicons
                            name={
                                flash === "on"
                                    ? "flash"
                                    : flash === "auto"
                                      ? "flash-outline"
                                      : "flash-off"
                            }
                            size={20}
                            color={flash === "off" ? "#9CA3AF" : "#FFD700"}
                        />
                        <RNText
                            className="text-white text-xs ml-1 font-medium"
                            style={{ textTransform: "uppercase" }}
                        >
                            {flash}
                        </RNText>
                    </TouchableOpacity>

                    {/* Photo Count + Review */}
                    <View className="flex-row items-center gap-2">
                        {capturedCount > 0 && (
                            <>
                                <View
                                    className={`px-2.5 py-1 rounded-full ${
                                        type === "before"
                                            ? "bg-blue-500"
                                            : "bg-green-500"
                                    }`}
                                >
                                    <Text className="text-white font-bold text-sm">
                                        {capturedCount}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    onPress={onDone}
                                    className="bg-white px-3 py-1.5 rounded-full"
                                >
                                    <RNText className="text-black font-semibold text-sm">
                                        Review
                                    </RNText>
                                </TouchableOpacity>
                            </>
                        )}
                        {capturedCount === 0 && <View style={{ width: 80 }} />}
                    </View>
                </View>

                {/* Camera Preview */}
                <View
                    style={{
                        width: SCREEN_WIDTH,
                        height: CAMERA_HEIGHT,
                        overflow: "hidden",
                        backgroundColor: "#1a1a1a",
                        alignSelf: "center",
                    }}
                >
                    <GestureDetector gesture={pinchGesture}>
                        <View style={{ flex: 1 }}>
                            <CameraView
                                ref={cameraRef}
                                facing={facing}
                                flash={flash}
                                zoom={zoom}
                                onCameraReady={handleCameraReady}
                                responsiveOrientationWhenOrientationLocked={
                                    true
                                }
                                style={{ flex: 1 }}
                                ratio="4:3"
                            />
                        </View>
                    </GestureDetector>
                </View>

                {/* Bottom Controls */}
                <View
                    style={{
                        flex: 1,
                        backgroundColor: "black",
                        paddingBottom: insets.bottom + 20,
                        justifyContent: "flex-end",
                        alignItems: "center",
                    }}
                >
                    <View className="w-full flex-row justify-around items-center px-8 mb-6">
                        <View style={{ width: 48 }} />
                        {/* Capture Button */}
                        <TouchableOpacity
                            onPress={handleTakePicture}
                            disabled={!isCameraReady}
                            style={{
                                width: 80,
                                height: 80,
                                borderRadius: 40,
                                backgroundColor: isCameraReady
                                    ? "#FFFFFF"
                                    : "#666666",
                                borderWidth: 4,
                                borderColor: "#D1D5DB",
                            }}
                            activeOpacity={0.7}
                        />
                        {/* Camera Flip */}
                        <TouchableOpacity
                            onPress={toggleFacing}
                            style={{ backgroundColor: "#1f2937" }}
                            className="w-12 h-12 rounded-full items-center justify-center opacity-80"
                        >
                            <Ionicons
                                name="camera-reverse"
                                size={24}
                                color="#FFF"
                            />
                        </TouchableOpacity>
                    </View>

                    <RNText className="text-gray-500 text-xs mb-2">
                        Pinch to zoom
                    </RNText>
                </View>
            </View>
        </GestureHandlerRootView>
    );
}
