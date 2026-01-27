import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Image,
    GestureResponderEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from "react-native-reanimated";
import { parseISO, format, addDays } from "date-fns";
import { Schedule } from "@/types";
import { formatTimeUTC, formatDateReadable } from "@/utils/date";
import Ionicons from "@expo/vector-icons/Ionicons";
import { openMaps } from "@/utils/dashboard";
import { PhotoDocumentationModal } from "../PhotoComponents/PhotoDocumentationModal";
import { WeatherService, WeatherData } from "@/services/weather/WeatherService";
import { GeocodingService } from "@/services/weather/GeocodingService";
import { useQuery, DEFAULT_ROW_COMPARATOR } from "@powersync/react-native";

interface DailyAgendaProps {
    selectedDate: string; // ISO string in UTC
    schedules: ReadonlyArray<Schedule>;
    isManager?: boolean;
    userId: string;
    onDateChange?: (date: string) => void; // For navigation
    showSevereWeatherAlert?: boolean; // Add this prop to control weather alert visibility
    onInvoicePress?: (schedule: Schedule) => void; // Callback when invoice is pressed
}

// Helper function to safely extract technician ID
const getTechnicianId = (technicians: any): string => {
    if (typeof technicians === "string") {
        return technicians.split(",")[0] || "";
    }
    if (Array.isArray(technicians) && technicians.length > 0) {
        return technicians[0];
    }
    return "";
};

const TIME_SLOTS: Array<"Morning" | "Afternoon" | "Evening"> = [
    "Morning",
    "Afternoon",
    "Evening",
];

interface ScheduleCardProps {
    schedule: Schedule;
    weather?: WeatherData;
    onOpenInvoice: (schedule: Schedule) => void;
    onOpenPhotos: (schedule: Schedule) => void;
    onOpenMap: (schedule: Schedule) => void;
}

const ScheduleCard = React.memo(
    ({
        schedule,
        weather,
        onOpenInvoice,
        onOpenPhotos,
        onOpenMap,
    }: ScheduleCardProps) => {
        const startTime = useMemo(() => {
            try {
                const parsed = parseISO(schedule.startDateTime);
                return formatTimeUTC(parsed);
            } catch (err) {
                console.error(
                    "Error formatting time",
                    schedule.startDateTime,
                    err,
                );
                return "";
            }
        }, [schedule.startDateTime]);

        const { statusColor, statusBorder } = useMemo(() => {
            if (schedule.confirmed) {
                return {
                    statusColor: "bg-green-50 dark:bg-green-900/20",
                    statusBorder: "border-l-green-500",
                };
            }

            return {
                statusColor: "bg-gray-100 dark:bg-gray-700",
                statusBorder: "border-l-gray-300",
            };
        }, [schedule.confirmed]);

        const { data: photoCounts = [] } = useQuery<{
            totalCount: number | null;
            beforeAfterCount: number | null;
        }>(
            schedule?.id
                ? `SELECT
                     COUNT(*) as totalCount,
                     SUM(CASE WHEN type IN ('before', 'after') THEN 1 ELSE 0 END) as beforeAfterCount
                   FROM photos WHERE scheduleId = ?`
                : `SELECT 0 as totalCount, 0 as beforeAfterCount`,
            [schedule.id],
            { rowComparator: DEFAULT_ROW_COMPARATOR },
        );

        const totalCount = Number(photoCounts[0]?.totalCount ?? 0);
        const beforeAfterCount = Number(photoCounts[0]?.beforeAfterCount ?? 0);

        const { hasPhotos, showNotificationBadge, photoIcon } = useMemo(() => {
            const parsedHasPhotos = totalCount > 0;
            const iconName: "camera" | "images" =
                beforeAfterCount > 0 ? "images" : "camera";

            const hasTechnicianNotes =
                "technicianNotes" in schedule &&
                typeof schedule.technicianNotes === "string" &&
                schedule.technicianNotes.trim().length > 0;

            return {
                hasPhotos: parsedHasPhotos,
                showNotificationBadge: hasTechnicianNotes,
                photoIcon: iconName,
            };
        }, [beforeAfterCount, schedule, totalCount]);

        const handleCardPress = useCallback(() => {
            if (schedule.invoiceRef) {
                onOpenInvoice(schedule);
            }
        }, [onOpenInvoice, schedule]);

        const handlePhotosPress = useCallback(
            (event: GestureResponderEvent) => {
                event.stopPropagation();
                onOpenPhotos(schedule);
            },
            [onOpenPhotos, schedule],
        );

        const handleMapPress = useCallback(
            (event: GestureResponderEvent) => {
                event.stopPropagation();
                onOpenMap(schedule);
            },
            [onOpenMap, schedule],
        );

        return (
            <TouchableOpacity
                onPress={handleCardPress}
                className={`${statusColor} rounded-lg overflow-hidden border-l-4 ${statusBorder}`}
                activeOpacity={0.9}
            >
                <View className="p-4">
                    <View className="flex-row justify-between items-start">
                        <View className="flex-1">
                            <View className="flex-row items-start gap-2 mb-1">
                                <Text
                                    className="flex-1 text-lg font-medium text-gray-900 dark:text-white pr-2"
                                    numberOfLines={2}
                                    ellipsizeMode="tail"
                                >
                                    {schedule.jobTitle}
                                </Text>
                                {/* Weather Indicator */}
                                {weather && (
                                    <View className="flex-row items-center gap-1 flex-shrink-0">
                                        <Image
                                            source={{
                                                uri: WeatherService.getIconUrl(
                                                    weather.condition.icon,
                                                ),
                                            }}
                                            style={{ width: 20, height: 20 }}
                                        />
                                        <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            {Math.round(weather.temp_c)}
                                            {"\u00B0"}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <Text className="text-gray-500 dark:text-gray-400 mb-2">
                                {startTime} {"\u2022"}{" "}
                                {schedule.assignedTechnicians
                                    ? "Assigned"
                                    : "Unassigned"}
                            </Text>

                            {/* Technician notes indicator */}
                            {showNotificationBadge && (
                                <View className="mb-2 flex-row items-center bg-red-50 px-2 py-1 rounded-md">
                                    <Ionicons
                                        name="document-text"
                                        size={14}
                                        color="#EF4444"
                                    />
                                    <Text className="text-xs text-red-600 font-medium ml-1">
                                        Technician Notes
                                    </Text>
                                </View>
                            )}

                            <View className="flex-row items-center">
                                <Ionicons
                                    name="location-outline"
                                    size={16}
                                    color="#9CA3AF"
                                />
                                <Text
                                    numberOfLines={1}
                                    className="text-gray-500 dark:text-gray-400 ml-1"
                                >
                                    {schedule.location}
                                </Text>
                            </View>
                        </View>

                        <View className="flex-row">
                            {/* Camera/Photo Documentation Button */}
                            <TouchableOpacity
                                onPress={handlePhotosPress}
                                className="bg-blue-500 p-2 rounded-full mr-2 relative"
                            >
                                <Ionicons
                                    name={photoIcon}
                                    size={20}
                                    color="#ffffff"
                                />
                            </TouchableOpacity>

                            {/* Map Button */}
                            <TouchableOpacity
                                onPress={handleMapPress}
                                className="bg-darkGreen p-2 rounded-full"
                            >
                                <Ionicons
                                    name="navigate"
                                    size={20}
                                    color="#ffffff"
                                />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        );
    },
);

export function DailyAgenda({
    selectedDate,
    schedules,
    isManager,
    userId,
    onDateChange,
    showSevereWeatherAlert = true, // Default to true for backward compatibility
    onInvoicePress, // Callback for when invoice is pressed
}: DailyAgendaProps) {
    const [photoModalVisible, setPhotoModalVisible] = useState(false);
    const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(
        null,
    );
    const [weatherDataMap, setWeatherDataMap] = useState<
        Map<string, WeatherData>
    >(new Map());

    const loadWeatherForDate = useCallback(async () => {
        const uniqueLocations = Array.from(
            new Set(
                schedules
                    .filter((schedule) => Boolean(schedule.location))
                    .map((schedule) => schedule.location as string),
            ),
        );

        if (uniqueLocations.length === 0) {
            return new Map<string, WeatherData>();
        }

        const dateStr = format(parseISO(selectedDate), "yyyy-MM-dd");

        const weatherEntries = await Promise.all(
            uniqueLocations.map(async (location) => {
                try {
                    const coords =
                        await GeocodingService.getCoordinates(location);
                    if (!coords) {
                        return null;
                    }

                    const forecast = await WeatherService.getForecast(
                        coords.latitude,
                        coords.longitude,
                    );

                    const dayWeather = forecast.find(
                        (day) => day.date === dateStr,
                    );
                    return dayWeather
                        ? ([location, dayWeather] as const)
                        : null;
                } catch (error) {
                    console.error("Error loading weather for", location, error);
                    return null;
                }
            }),
        );

        const weatherMap = new Map<string, WeatherData>();

        weatherEntries.forEach((entry) => {
            if (entry) {
                const [location, weather] = entry;
                weatherMap.set(location, weather);
            }
        });

        return weatherMap;
    }, [schedules, selectedDate]);

    // Load weather for all locations on selected date
    useEffect(() => {
        let isActive = true;

        loadWeatherForDate()
            .then((weatherMap) => {
                if (isActive) {
                    setWeatherDataMap(weatherMap);
                }
            })
            .catch((error) =>
                console.error("Error loading weather data", error),
            );

        return () => {
            isActive = false;
        };
    }, [loadWeatherForDate]);

    // Group schedules by time slot for better visualization
    const groupedSchedules = useMemo(() => {
        return schedules.reduce<Record<string, Schedule[]>>((acc, schedule) => {
            try {
                const date = parseISO(schedule.startDateTime);
                // Use getUTCHours() since dates are stored in UTC
                const hour = date.getUTCHours();
                const timeSlot =
                    hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";

                if (!acc[timeSlot]) {
                    acc[timeSlot] = [];
                }

                acc[timeSlot].push(schedule);
            } catch (err) {
                console.error(
                    "Error parsing date",
                    schedule.startDateTime,
                    err,
                );
            }
            return acc;
        }, {});
    }, [schedules]);

    const handleMapPress = useCallback((schedule: Schedule) => {
        if (schedule.location) {
            openMaps(schedule.location, schedule.jobTitle);
        }
    }, []);

    const handlePhotoDocumentationPress = useCallback((schedule: Schedule) => {
        setSelectedSchedule(schedule);
        setPhotoModalVisible(true);
    }, []);

    const handleInvoicePress = useCallback(
        (schedule: Schedule) => {
            if (!schedule.invoiceRef) {
                return;
            }

            // Use parent callback if provided
            if (onInvoicePress) {
                onInvoicePress(schedule);
            }
        },
        [onInvoicePress],
    );

    const severeWeatherJobs = useMemo(
        () =>
            schedules.filter((schedule) => {
                const weather = weatherDataMap.get(schedule.location);
                return weather && WeatherService.isSevereWeather(weather);
            }),
        [schedules, weatherDataMap],
    );

    const goToPreviousDay = useCallback(() => {
        if (!onDateChange) {
            return;
        }

        const previousDate = addDays(parseISO(selectedDate), -1);
        onDateChange(previousDate.toISOString());
    }, [onDateChange, selectedDate]);

    const goToNextDay = useCallback(() => {
        if (!onDateChange) {
            return;
        }

        const followingDate = addDays(parseISO(selectedDate), 1);
        onDateChange(followingDate.toISOString());
    }, [onDateChange, selectedDate]);

    // Gesture handling for horizontal swipe navigation (only in day view)
    const translateX = useSharedValue(0);
    const SWIPE_THRESHOLD = 50;

    const panGesture = Gesture.Pan()
        .enabled(!!onDateChange) // Only enable gestures when in day view
        .activeOffsetX([-20, 20]) // Only activate on horizontal swipe
        .failOffsetY([-20, 20]) // Fail on vertical swipe to allow scrolling
        .onUpdate((event) => {
            translateX.value = event.translationX;
        })
        .onEnd((event) => {
            const translation = event.translationX;
            translateX.value = withSpring(0);

            // Bridge from UI thread to JS thread (same pattern as FastImageViewer)
            if (translation > SWIPE_THRESHOLD) {
                scheduleOnRN(goToPreviousDay);
            } else if (translation < -SWIPE_THRESHOLD) {
                scheduleOnRN(goToNextDay);
            }
        });

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [
                {
                    translateX: translateX.value * 0.2, // Dampen the swipe for better feel
                },
            ],
            opacity: 1 - Math.abs(translateX.value) / 1000, // Subtle fade during swipe
        };
    });

    const content = (
        <Animated.View
            style={[animatedStyle, { flex: 1 }]}
            className="bg-white dark:bg-gray-900 p-4"
        >
            {/* Date Navigation Header - only show in day view */}
            {onDateChange && (
                <View className="flex-row items-center justify-between mb-4">
                    <TouchableOpacity
                        onPress={goToPreviousDay}
                        className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full"
                    >
                        <Ionicons
                            name="chevron-back"
                            size={20}
                            color="#6B7280"
                        />
                    </TouchableOpacity>

                    <Text className="text-xl font-bold text-gray-900 dark:text-white">
                        {formatDateReadable(new Date(selectedDate))}
                    </Text>

                    <TouchableOpacity
                        onPress={goToNextDay}
                        className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full"
                    >
                        <Ionicons
                            name="chevron-forward"
                            size={20}
                            color="#6B7280"
                        />
                    </TouchableOpacity>
                </View>
            )}

            {/* Date header for month view (no navigation arrows) */}
            {!onDateChange && (
                <Text className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
                    {formatDateReadable(new Date(selectedDate))}
                </Text>
            )}

            {/* Severe Weather Alert - conditionally show based on prop */}
            {showSevereWeatherAlert && severeWeatherJobs.length > 0 && (
                <View className="mb-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3">
                    <View className="flex-row items-start gap-2">
                        <Text className="text-2xl">⚠️</Text>
                        <View className="flex-1">
                            <Text className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                                Severe Weather Alert
                            </Text>
                            <Text className="text-sm text-yellow-700 dark:text-yellow-300">
                                {severeWeatherJobs.length} job
                                {severeWeatherJobs.length !== 1 ? "s" : ""}{" "}
                                affected by adverse weather conditions
                            </Text>
                            <View className="mt-2 gap-1">
                                {severeWeatherJobs.slice(0, 3).map((job) => {
                                    const weather = weatherDataMap.get(
                                        job.location,
                                    )!;
                                    return (
                                        <Text
                                            key={job.id}
                                            className="text-xs text-yellow-700 dark:text-yellow-300"
                                        >
                                            • {job.jobTitle}:{" "}
                                            {weather.condition.text} (
                                            {Math.round(weather.temp_c)}°)
                                        </Text>
                                    );
                                })}
                                {severeWeatherJobs.length > 3 && (
                                    <Text className="text-xs text-yellow-700 dark:text-yellow-300">
                                        • +{severeWeatherJobs.length - 3}{" "}
                                        more...
                                    </Text>
                                )}
                            </View>
                        </View>
                    </View>
                </View>
            )}

            <ScrollView className="flex-1">
                {schedules.length === 0 ? (
                    <View className="py-6 items-center">
                        <Text className="text-gray-500 dark:text-gray-400 text-center italic">
                            No schedules for this day
                        </Text>
                    </View>
                ) : (
                    <View className="flex-col">
                        {TIME_SLOTS.map((timeSlot) => {
                            const slotSchedules =
                                groupedSchedules[timeSlot] || [];
                            if (slotSchedules.length === 0) return null;

                            return (
                                <View key={timeSlot} className="mb-6">
                                    <Text className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">
                                        {timeSlot}
                                    </Text>
                                    <View className="flex flex-col gap-3">
                                        {slotSchedules.map((schedule) => (
                                            <ScheduleCard
                                                key={schedule.id}
                                                schedule={schedule}
                                                weather={weatherDataMap.get(
                                                    schedule.location,
                                                )}
                                                onOpenInvoice={
                                                    handleInvoicePress
                                                }
                                                onOpenPhotos={
                                                    handlePhotoDocumentationPress
                                                }
                                                onOpenMap={handleMapPress}
                                            />
                                        ))}
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}
            </ScrollView>

            {/* Photo Documentation Modal */}
            {selectedSchedule && (
                <PhotoDocumentationModal
                    visible={photoModalVisible}
                    onClose={() => setPhotoModalVisible(false)}
                    scheduleId={selectedSchedule.id}
                    jobTitle={selectedSchedule.jobTitle}
                    startDateTime={selectedSchedule.startDateTime}
                    technicianId={userId}
                />
            )}
        </Animated.View>
    );

    // Wrap with gesture detector only if onDateChange is provided (day view)
    return onDateChange ? (
        <GestureDetector gesture={panGesture}>{content}</GestureDetector>
    ) : (
        content
    );
}
