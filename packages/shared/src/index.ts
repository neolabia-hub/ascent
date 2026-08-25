export { PERMISSIONS, SEED_ROLE_PERMISSIONS } from './constants/permissions.js';
export type { PermissionCode } from './constants/permissions.js';

export { tenantSettingsSchema, tenantBrandingSchema } from './schemas/tenant-settings.js';
export type { TenantSettings, TenantBranding } from './schemas/tenant-settings.js';

export { loginSchema, changePasswordSchema, activationSchema } from './schemas/auth.js';
export type { LoginInput, ChangePasswordInput, ActivationInput } from './schemas/auth.js';

export {
  catalogBaseSchema,
  areaSchema,
  processSchema,
  jobTitleTypeSchema,
  jobTitleSchema,
  serviceSchema,
  regionalSchema,
  normSchema,
  activityTypeSchema,
  activityTypeConfigSchema,
  areaUpdateSchema,
  processUpdateSchema,
  jobTitleTypeUpdateSchema,
  jobTitleUpdateSchema,
  serviceUpdateSchema,
  regionalUpdateSchema,
  normUpdateSchema,
  activityTypeUpdateSchema,
} from './schemas/catalogs.js';
export type { AreaInput, ProcessInput, JobTitleInput, NormInput, ActivityTypeInput, ActivityTypeConfig } from './schemas/catalogs.js';

export {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
  importRowSchema,
  setOverridesSchema,
  setAnalystScopesSchema,
  documentTypeSchema,
  employmentTypeSchema,
  roadActorSchema,
  IMPORT_HEADERS,
} from './schemas/users.js';
export type {
  CreateUserInput,
  UpdateUserInput,
  ListUsersQuery,
  ImportRowInput,
  SetOverridesInput,
  SetAnalystScopesInput,
} from './schemas/users.js';

export {
  approvalActionSchema,
  createApprovalSchema,
  decideApprovalSchema,
  listApprovalsQuerySchema,
} from './schemas/approvals.js';
export type { CreateApprovalInput, DecideApprovalInput } from './schemas/approvals.js';

export {
  modalitySchema,
  createActivitySchema,
  updateActivitySchema,
  listActivitiesQuerySchema,
  contentTypeSchema,
  contentConfigSchema,
  createContentSchema,
  updateContentSchema,
  reorderContentsSchema,
  updateVersionSettingsSchema,
  migrationPolicySchema,
  publishVersionSchema,
} from './schemas/activities.js';
export type {
  CreateActivityInput,
  UpdateActivityInput,
  ListActivitiesQuery,
  CreateContentInput,
  UpdateContentInput,
  UpdateVersionSettingsInput,
  PublishVersionInput,
} from './schemas/activities.js';

export {
  MAX_CARD_VIDEO_SECONDS,
  VIDEO_WARNING_SECONDS,
  anyCardSchema,
  cardTypeSchema,
  createLessonSchema,
  updateLessonSchema,
  saveCardsSchema,
  textImageCardSchema,
  videoShortCardSchema,
  quizCardSchema,
  flipCardSchema,
  pollCardSchema,
  fillGapCardSchema,
} from './schemas/lessons.js';
export type { CardPayload, CardType, CreateLessonInput, SaveCardsInput } from './schemas/lessons.js';

export {
  questionTypeSchema,
  questionPayloadSchema,
  createQuestionSchema,
  reviseQuestionSchema,
  createQuestionCategorySchema,
  listQuestionsQuerySchema,
  gradingPolicySchema,
  reviewPolicySchema,
  createAssessmentSchema,
  assessmentSectionSchema,
  updateAssessmentDraftSchema,
  publishAssessmentSchema,
} from './schemas/assessments.js';
export type {
  QuestionType,
  QuestionPayload,
  CreateQuestionInput,
  AssessmentSectionInput,
  UpdateAssessmentDraftInput,
} from './schemas/assessments.js';
