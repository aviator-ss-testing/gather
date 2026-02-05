import { H3, Spinner, XStack, YStack } from "tamagui";
import {
  StyledButton,
  StyledText,
  StyledTextArea,
  StyledView,
  Icon,
} from "../components/Themed";
import { CollectionSelect } from "../components/CollectionSelect";
import { useContext, useState } from "react";
import { UserContext } from "../utils/user";
import { DatabaseContext } from "../utils/db";
import { BlockType } from "../utils/mimeTypes";
import { BlockInsertInfo } from "../utils/dataTypes";
import { Alert, Keyboard, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

export default function Capture() {
  const [textValue, setTextValue] = useState("");
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { currentUser } = useContext(UserContext);
  const { createBlocks } = useContext(DatabaseContext);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  async function handleSave() {
    const trimmed = textValue.trim();
    if (!trimmed) return;

    setIsSaving(true);
    try {
      const block: BlockInsertInfo = {
        createdBy: currentUser!.id,
        content: trimmed,
        type: BlockType.Text,
        collectionsToConnect: selectedCollection
          ? [{ collectionId: selectedCollection }]
          : [],
      };

      await createBlocks({
        blocksToInsert: [block],
      });

      setTextValue("");
      setSaved(true);
      Keyboard.dismiss();

      setTimeout(() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)/home");
        }
      }, 600);
    } catch (err) {
      Alert.alert("Error", "Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!currentUser) {
    return null;
  }

  return (
    <StyledView flex={1} paddingBottom={insets.bottom} paddingTop={insets.top}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <YStack paddingHorizontal="$4" gap="$3" flex={1} paddingTop="$2">
          <XStack justifyContent="space-between" alignItems="center">
            <H3>Quick Capture</H3>
            {saved && (
              <XStack alignItems="center" gap="$1.5">
                <Icon name="checkmark-circle" color="$green10" size={20} />
                <StyledText color="$green10">Saved</StyledText>
              </XStack>
            )}
          </XStack>

          <YStack alignItems="flex-start">
            <CollectionSelect
              selectedCollection={selectedCollection}
              setSelectedCollection={setSelectedCollection}
              collectionPlaceholder="No collection"
              triggerProps={{
                theme: "orange",
                backgroundColor: "$orange6",
              }}
              onTriggerSelect={() => {
                Keyboard.dismiss();
              }}
            />
          </YStack>

          <XStack position="relative" flex={1}>
            <StyledTextArea
              value={textValue}
              onChangeText={setTextValue}
              placeholder="What do you want to capture?"
              flex={1}
              minHeight={150}
              maxLength={2000}
              paddingBottom="$8"
              verticalAlign="top"
            />
          </XStack>

          <XStack justifyContent="flex-end" paddingBottom="$2">
            <StyledButton
              theme="green"
              size="$medium"
              onPress={handleSave}
              disabled={isSaving || !textValue.trim()}
              icon={isSaving ? <Spinner size="small" /> : undefined}
            >
              {isSaving ? "Saving..." : "Save"}
            </StyledButton>
          </XStack>
        </YStack>
      </KeyboardAvoidingView>
    </StyledView>
  );
}
