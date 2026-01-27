import { useState } from "react";
import { View, Text, Modal, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PhotoCapture } from "../PhotoComponents/PhotoCapture";
import { JobPhotoHistory } from "./JobPhotoHistory";
import { useQuery, DEFAULT_ROW_COMPARATOR } from "@powersync/react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

interface PhotoDocumentationModalProps {
    visible: boolean;
    onClose: () => void;
    scheduleId: string;
    jobTitle: string;
    startDateTime: string;
    technicianId: string;
}

// Tab type for the modal navigation
type TabType = "before" | "after" | "history";

export function PhotoDocumentationModal({
    visible,
    onClose,
    scheduleId,
    jobTitle,
    startDateTime,
    technicianId,
}: PhotoDocumentationModalProps) {
    const [activeTab, setActiveTab] = useState<TabType>("before");
    const insets = useSafeAreaInsets();
    const { data: photoCounts = [] } = useQuery<{
        beforeCount: number | null;
        afterCount: number | null;
    }>(
        scheduleId
            ? `SELECT
                 SUM(CASE WHEN type = 'before' THEN 1 ELSE 0 END) as beforeCount,
                 SUM(CASE WHEN type = 'after' THEN 1 ELSE 0 END) as afterCount
               FROM photos
               WHERE scheduleId = ?`
            : `SELECT 0 as beforeCount, 0 as afterCount`,
        [scheduleId],
        { rowComparator: DEFAULT_ROW_COMPARATOR },
    );

    const beforeCount = Number(photoCounts[0]?.beforeCount ?? 0);
    const afterCount = Number(photoCounts[0]?.afterCount ?? 0);

    // Handle close with logging
    const handleClose = () => {
        onClose();
    };

    // Handle tab change with logging
    const handleTabChange = (tab: TabType) => {
        setActiveTab(tab);
    };

    if (!visible) return null;

    // Rebuilt with inline styles and Pressable (iOS-compatible)
    return (
        <Modal
            visible={visible}
            onRequestClose={onClose}
            presentationStyle="fullScreen"
            animationType="slide"
        >
            <View
                style={{
                    flex: 1,
                    backgroundColor: "#f9fafb",
                    paddingTop: insets.top,
                }}
            >
                {/* Header */}
                <View
                    style={{
                        backgroundColor: "#064e3b", // darkGreen equivalent
                        padding: 16,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 3,
                        elevation: 3,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <Text
                        style={{
                            color: "white",
                            fontSize: 20,
                            fontWeight: "bold",
                            flex: 1,
                        }}
                    >
                        {jobTitle}
                    </Text>

                    <Pressable
                        onPress={handleClose}
                        hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                        style={({ pressed }) => ({
                            width: 44,
                            height: 44,
                            backgroundColor: pressed
                                ? "rgba(255, 255, 255, 0.3)"
                                : "rgba(255, 255, 255, 0.2)",
                            borderRadius: 16,
                            alignItems: "center",
                            justifyContent: "center",
                        })}
                    >
                        <Ionicons name="close" size={24} color="white" />
                    </Pressable>
                </View>

                {/* Tabs */}
                <View
                    style={{
                        flexDirection: "row",
                        borderBottomWidth: 1,
                        borderBottomColor: "#e5e7eb",
                        backgroundColor: "white",
                    }}
                >
                    {["before", "after", "history"].map((tab) => (
                        <Pressable
                            key={tab}
                            onPress={() => handleTabChange(tab as TabType)}
                            style={{
                                flex: 1,
                                paddingVertical: 16,
                                paddingHorizontal: 16,
                                borderBottomWidth: activeTab === tab ? 2 : 0,
                                borderBottomColor: "#064e3b", // darkGreen
                            }}
                        >
                            <Text
                                style={{
                                    textAlign: "center",
                                    fontWeight: "600",
                                    color:
                                        activeTab === tab
                                            ? "#064e3b"
                                            : "#6b7280",
                                }}
                            >
                                {tab === "before"
                                    ? `Before Photos${beforeCount ? ` (${beforeCount})` : ""}`
                                    : tab === "after"
                                      ? `After Photos${afterCount ? ` (${afterCount})` : ""}`
                                      : "Job History"}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {/* Content */}
                {activeTab === "before" || activeTab === "after" ? (
                    <ScrollView
                        style={{
                            flex: 1,
                            paddingHorizontal: 16,
                            paddingVertical: 16,
                        }}
                    >
                        <PhotoCapture
                            technicianId={technicianId}
                            type={activeTab}
                            jobTitle={jobTitle}
                            startDate={startDateTime}
                            scheduleId={scheduleId}
                        />
                    </ScrollView>
                ) : (
                    <View
                        style={{
                            flex: 1,
                            paddingHorizontal: 16,
                            paddingVertical: 16,
                        }}
                    >
                        <JobPhotoHistory
                            scheduleId={scheduleId}
                            jobTitle={jobTitle}
                        />
                    </View>
                )}
            </View>
        </Modal>
    );
}
