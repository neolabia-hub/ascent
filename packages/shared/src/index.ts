export { POINTS } from './constants/points.js';
export { PERMISSIONS, SEED_ROLE_PERMISSIONS } from './constants/permissions.js';
export type { PermissionCode } from './constants/permissions.js';

export { tenantSettingsSchema, tenantBrandingSchema } from './schemas/tenant-settings.js';
export type { TenantSettings, TenantBranding } from './schemas/tenant-settings.js';

export {
  loginSchema,
  changePasswordSchema,
  activationSchema,
  avatarSchema,
  helpRequestSchema,
  platformLoginSchema,
  platformSettingsSchema,
  revokeCertificateSchema,
} from './schemas/auth.js';
export type {
  LoginInput,
  ChangePasswordInput,
  ActivationInput,
  AvatarInput,
  HelpRequestInput,
  PlatformLoginInput,
  PlatformSettingsInput,
  RevokeCertificateInput,
} from './schemas/auth.js';

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
  offeringKindSchema,
  offeringStatusSchema,
  executedBySchema,
  createOfferingSchema,
  updateOfferingSchema,
  listOfferingsQuerySchema,
  publishOfferingSchema,
  adjustProjectedSchema,
  cancelOfferingSchema,
  enrollOfferingSchema,
  migrateOfferingVersionSchema,
} from './schemas/offerings.js';
export type {
  CreateOfferingInput,
  UpdateOfferingInput,
  ListOfferingsQuery,
  PublishOfferingInput,
  AdjustProjectedInput,
  CancelOfferingInput,
  EnrollOfferingInput,
  MigrateOfferingVersionInput,
} from './schemas/offerings.js';

export {
  audienceRuleSchema,
  createAudienceSchema,
  updateAudienceSchema,
  assignmentTargetTypeSchema,
  ruleTriggerSchema,
  recurrenceSchema,
  createAssignmentRuleSchema,
  updateAssignmentRuleSchema,
  setActivityRequirementSchema,
  toggleJobTitleMatrixSchema,
  assignmentStatusSchema,
  createAssignmentSchema,
  waiveAssignmentSchema,
  listAssignmentsQuerySchema,
} from './schemas/assignments.js';
export type {
  AudienceRule,
  CreateAudienceInput,
  UpdateAudienceInput,
  Recurrence,
  CreateAssignmentRuleInput,
  UpdateAssignmentRuleInput,
  SetActivityRequirementInput,
  ToggleJobTitleMatrixInput,
  CreateAssignmentInput,
  WaiveAssignmentInput,
  ListAssignmentsQuery,
} from './schemas/assignments.js';

export {
  progressSchema,
  answerSchema,
  saveAnswerSchema,
  submitAttemptSchema,
  reviewAnswerSchema,
  submitReviewSchema,
  selfEnrollSchema,
  listMyWorkQuerySchema,
} from './schemas/learning.js';
export type {
  ProgressInput,
  AnswerInput,
  SaveAnswerInput,
  SubmitAttemptInput,
  ReviewAnswerInput,
  SubmitReviewInput,
  SelfEnrollInput,
  ListMyWorkQuery,
} from './schemas/learning.js';

export {
  planStatusSchema,
  planItemStatusSchema,
  createTrainingPlanSchema,
  updateTrainingPlanSchema,
  addPlanItemSchema,
  updatePlanItemSchema,
  approvePlanSchema,
  deletePlanSchema,
  reopenPlanSchema,
  listPlansQuerySchema,
} from './schemas/plans.js';
export type {
  CreateTrainingPlanInput,
  UpdateTrainingPlanInput,
  AddPlanItemInput,
  UpdatePlanItemInput,
  ApprovePlanInput,
  DeletePlanInput,
  ReopenPlanInput,
  ListPlansQuery,
} from './schemas/plans.js';

export {
  questionTypeSchema,
  questionPayloadSchema,
  createQuestionSchema,
  reviseQuestionSchema,
  setQuestionCategorySchema,
  createQuestionCategorySchema,
  listQuestionsQuerySchema,
  gradingPolicySchema,
  reviewPolicySchema,
  createAssessmentSchema,
  assessmentSectionSchema,
  updateAssessmentDraftSchema,
  publishAssessmentSchema,
  presentationSchema,
  updatePresentationSchema,
} from './schemas/assessments.js';
export type {
  QuestionType,
  QuestionPayload,
  CreateQuestionInput,
  AssessmentSectionInput,
  UpdateAssessmentDraftInput,
  PresentationInput,
} from './schemas/assessments.js';

export {
  campoSchema,
  certificateFieldsSchema,
  firmanteSchema,
  certificateTemplateSchema,
  CAMPOS_CONSTANCIA,
  CAMPOS_POR_DEFECTO,
} from './schemas/certificate-layout.js';
export type {
  CampoConstancia,
  CampoClave,
  CertificateFields,
  FirmanteConstancia,
  CertificateTemplateInput,
} from './schemas/certificate-layout.js';

export {
  surveyQuestionSchema,
  surveyTemplateSchema,
  surveyAnswersSchema,
  surveyResponseSchema,
  PREGUNTAS_SATISFACCION,
  PREGUNTAS_EFICACIA,
} from './schemas/survey.js';
export type { SurveyQuestion, SurveyTemplateInput, SurveyResponseInput } from './schemas/survey.js';
