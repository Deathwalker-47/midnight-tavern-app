/**
 * Midnight Tavern presentational component library — barrel.
 *
 * Everything here is pure/presentational: props in, DOM out. No zustand, no bridge, no core
 * store access (importing TYPES from @midnight-tavern/core is fine). The two registers never
 * cross: numbers are mono, names/prose are serif. Screens import from this barrel.
 */

// Shared helpers (outcome palette, reduced-motion + count-up hooks).
export {
  fromCoreOutcome,
  outcomeVar,
  outcomeStamp,
  useReducedMotion,
  useCountUp,
  cssVar,
  FONT,
} from "./_shared";
export type { RollOutcome } from "./_shared";

// The signature component.
export { RulingArtifact } from "./RulingArtifact";
export type { RulingArtifactProps, RulingArtifactVariant, RulingRoll } from "./RulingArtifact";

// Mechanics.
export { ResourceBar, resourceFillColor } from "./ResourceBar";
export type { ResourceBarProps } from "./ResourceBar";
export { MasteryPips, pipsForRank } from "./MasteryPips";
export type { MasteryPipsProps } from "./MasteryPips";

// Character.
export { LivingCard, LivingCardView } from "./LivingCard";
export type { LivingCardProps } from "./LivingCard";
export { PartyStrip } from "./PartyStrip";
export type { PartyStripProps, PartyMember } from "./PartyStrip";
export { RelationshipRow, relationshipRowProps } from "./RelationshipRow";
export type { RelationshipRowProps } from "./RelationshipRow";
export { DeadMarker } from "./DeadMarker";
export type { DeadMarkerProps } from "./DeadMarker";

// Story shelf & timeline.
export { StoryCard } from "./StoryCard";
export type { StoryCardProps } from "./StoryCard";
export { ChapterCard } from "./ChapterCard";
export type { ChapterCardProps, ChapterStatus } from "./ChapterCard";
export { ArcDoc } from "./ArcDoc";
export type { ArcDocProps, ArcDocSection } from "./ArcDoc";

// Providers & roles.
export { ProviderCard } from "./ProviderCard";
export type { ProviderCardProps } from "./ProviderCard";
export { KeyField } from "./KeyField";
export type { KeyFieldProps, KeyFieldState } from "./KeyField";
export { RoleMatrixRow } from "./RoleMatrixRow";
export type { RoleMatrixRowProps, ModelRole, RoleFit, RoleModelOption } from "./RoleMatrixRow";
export { SamplerPanel } from "./SamplerPanel";
export type { SamplerPanelProps, SamplerField, SamplerPreset } from "./SamplerPanel";
export { MessageActions } from "./MessageActions";
export type { MessageActionsProps } from "./MessageActions";
export { LorebookLibraryCard } from "./LorebookLibraryCard";
export type { LorebookLibraryCardProps, LorebookSourceTag } from "./LorebookLibraryCard";
export { AttachRow, PersonaPickerRow } from "./AttachPanel";
export type { AttachRowProps, PersonaPickerRowProps, AttachSourceTag } from "./AttachPanel";
export { BlueprintForm } from "./BlueprintForm";
export type { BlueprintFormProps } from "./BlueprintForm";

// Primitives & feedback.
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant } from "./Button";
export { Chip } from "./Chip";
export type { ChipProps, ChipTone } from "./Chip";
export { InlineNotice, noticeTone } from "./InlineNotice";
export type { InlineNoticeProps, NoticeSeverity } from "./InlineNotice";
export { Toast } from "./Toast";
export type { ToastProps } from "./Toast";
export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";
export { ConfirmDialog } from "./ConfirmDialog";
export type { ConfirmDialogProps } from "./ConfirmDialog";
export { ModelStatusChip, modelStatusTone } from "./ModelStatusChip";
export type { ModelStatusChipProps, ModelStatus } from "./ModelStatusChip";
export { PremiseInput } from "./PremiseInput";
export type { PremiseInputProps } from "./PremiseInput";
export { ForgingInterstitial } from "./ForgingInterstitial";
export type { ForgingInterstitialProps, ForgeOperationState, ForgeStep, ForgeStepStatus } from "./ForgingInterstitial";
export { ThinkingIndicator } from "./ThinkingIndicator";
export type { ThinkingIndicatorProps } from "./ThinkingIndicator";
export { DifficultyPicker, STANDARD_DIFFICULTY } from "./DifficultyPicker";
export type { DifficultyPreset, DifficultyValue } from "./DifficultyPicker";
export { SkillProgress } from "./SkillProgress";
export type { SkillProgressProps } from "./SkillProgress";
export { ActionSuggestions } from "./ActionSuggestions";
export type { ActionSuggestion, SuggestionsState } from "./ActionSuggestions";
export { LootAward, EQUIPMENT_TIER_META } from "./LootAward";
export type { EquipmentTier, LootAwardItem } from "./LootAward";
export { OperationStatus } from "./OperationStatus";
export type { TurnOperationPhase } from "./OperationStatus";
export { StoryCreationReview } from "./StoryCreationReview";
export type { MacroReview, MechanicSourceReview } from "./StoryCreationReview";
