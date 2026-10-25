import { type DynamicModule, Module, type Provider } from "@nestjs/common";
import type { ApiRuntimeConfig } from "@whatsapp-platform/config/runtime";
import type { Pool } from "pg";
import {
  EnvironmentCredentialReferenceResolver,
  ProviderCredentialCipher,
  ProviderCredentialService,
} from "@whatsapp-platform/whatsapp-provider";
import { ProviderCredentialRepository } from "../whatsapp/credentials/provider-credential.repository.js";
import { ProviderCredentialPersistenceService } from "../whatsapp/credentials/provider-credential-persistence.service.js";
import { SignupAttemptRepository } from "../whatsapp/signup/signup-attempt.repository.js";
import { EmbeddedSignupRepository } from "../whatsapp/signup/embedded-signup.repository.js";
import { EmbeddedSignupService } from "../whatsapp/signup/embedded-signup.service.js";
import { MetaEmbeddedSignupAdapter } from "../whatsapp/signup/meta-embedded-signup.adapter.js";
import { DATABASE_POOL } from "../database/database.constants.js";
import { DEPLOYMENT_MODE } from "../common/deployment-mode.js";

import { Argon2idPasswordHasher } from "../common/security/password-hasher.js";
import { AccessTokenGuard } from "../authorization/access-token.guard.js";
import { AuthorizationRepository } from "../authorization/authorization.repository.js";
import {
  AuthorizationService,
  TenantScopeService,
} from "../authorization/authorization.service.js";
import { PermissionGuard } from "../authorization/permission.guard.js";
import { TenantContentGuard } from "../authorization/tenant-content.guard.js";
import { TenantRoleProvisioningService } from "../authorization/tenant-role-provisioning.service.js";
import { MeController } from "../me/me.controller.js";
import { SuperAdminController } from "../platform/super-admin/super-admin.controller.js";
import { SuperAdminService } from "../platform/super-admin/super-admin.service.js";
import { SuperAdminRepository } from "../platform/super-admin/super-admin.repository.js";
import { MeRepository } from "../me/me.repository.js";
import { MeService } from "../me/me.service.js";
import { PlatformController } from "../platform/platform.controller.js";
import { PlatformRepository } from "../platform/platform.repository.js";
import { PlatformService } from "../platform/platform.service.js";
import {
  TenantInsightsController,
  PlatformInsightsController,
} from "../insights/insights.controller.js";
import { TenantInsightsRepository } from "../insights/tenant-insights.repository.js";
import { PlatformInsightsRepository } from "../insights/platform-insights.repository.js";
import { TenantInsightsService } from "../insights/tenant-insights.service.js";
import { PlatformInsightsService } from "../insights/platform-insights.service.js";
import {
  TenantReportExportController,
  PlatformReportExportController,
} from "../insights/exports/report-export.controller.js";
import { TenantReportExportService } from "../insights/exports/tenant-report-export.service.js";
import { PlatformReportExportService } from "../insights/exports/platform-report-export.service.js";
import { ReportExportService } from "../insights/exports/report-export.service.js";
import { ReportExportRepository } from "../insights/exports/report-export.repository.js";
import { CampaignExportRepository } from "../insights/exports/campaign-export.repository.js";
import { TemplateController } from "../templates/template.controller.js";
import { TemplateRepository } from "../templates/template.repository.js";
import { TemplateService } from "../templates/template.service.js";
import { AUTH_CONFIG } from "./auth.constants.js";
import { AccessTokenService } from "./access-token.service.js";
import { ApprovedOriginGuard } from "./approved-origin.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import { mapAuthModuleConfig } from "./auth.types.js";
import { LoginRateLimiterAdapter } from "./login-rate-limiter.adapter.js";
import { RefreshTokenService } from "./refresh-token.service.js";
import { WhatsAppController } from "../whatsapp/whatsapp.controller.js";
import { MetaWhatsAppProviderAdapter } from "../whatsapp/meta-whatsapp-provider.adapter.js";
import { WHATSAPP_PROVIDER } from "../whatsapp/whatsapp-provider.constants.js";
import { WhatsAppRepository } from "../whatsapp/whatsapp.repository.js";
import { WhatsAppService } from "../whatsapp/whatsapp.service.js";
import {
  WHATSAPP_ONBOARDING_CONFIG,
  WhatsAppOnboardingService,
} from "../whatsapp/whatsapp-onboarding.service.js";
import { ContactController } from "../contacts/contact.controller.js";
import { ContactRepository } from "../contacts/contact.repository.js";
import { ContactService } from "../contacts/contact.service.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { OutboxRepository } from "../database/outbox/outbox.repository.js";
import { GroupController } from "../groups/group.controller.js";
import { GroupRepository } from "../groups/group.repository.js";
import { GroupService } from "../groups/group.service.js";
import { ClamAvScanner } from "../imports/clamav-scanner.adapter.js";
import { ContactImportController } from "../imports/contact-import.controller.js";
import { ContactImportRepository } from "../imports/contact-import.repository.js";
import { ContactImportService } from "../imports/contact-import.service.js";
import { S3ObjectStorage } from "@whatsapp-platform/storage";
import { MessagingRepository } from "../messaging/messaging.repository.js";
import { MessagingService } from "../messaging/messaging.service.js";
import { CampaignController } from "../campaigns/campaign.controller.js";
import { CampaignRepository } from "../campaigns/campaign.repository.js";
import { CampaignService } from "../campaigns/campaign.service.js";
import { CampaignLifecycleRepository } from "../campaigns/campaign-lifecycle.repository.js";
import { CampaignLifecycleService } from "../campaigns/campaign-lifecycle.service.js";
import { ConversationController } from "../conversations/conversation.controller.js";
import { ConversationService } from "../conversations/conversation.service.js";
import { ConversationRepository } from "../conversations/conversation.repository.js";
import { ConversationReplyService } from "../conversations/conversation-reply.service.js";
import { ConversationCollaborationController } from "../conversations/conversation-collaboration.controller.js";
import { ConversationCollaborationService } from "../conversations/conversation-collaboration.service.js";
import { ConversationNoteRepository } from "../conversations/conversation-note.repository.js";
import { AutomationController } from "../automation/automation.controller.js";
import { AutomationService } from "../automation/automation.service.js";
import { AutomationRepository } from "../automation/automation.repository.js";
import { AutomationRunRepository } from "../automation/automation-run.repository.js";
import { AutomationControlService } from "../automation/automation-control.service.js";
import {
  AutomationControlController,
  ConversationAutomationController,
} from "../automation/automation-control.controller.js";
import { UserController } from "../users/user.controller.js";
import { UserRepository } from "../users/user.repository.js";
import { UserService } from "../users/user.service.js";
import { BootstrapController } from "../bootstrap/bootstrap.controller.js";
import { BootstrapRepository } from "../bootstrap/bootstrap.repository.js";
import { BootstrapService, BOOTSTRAP_SECRET } from "../bootstrap/bootstrap.service.js";
import { SeedRepository } from "../database/seed/seed.repository.js";
import { PasswordChangeController } from "./password-change/password-change.controller.js";
import { PasswordChangeService } from "./password-change/password-change.service.js";
import { PasswordChangeRepository } from "./password-change/password-change.repository.js";

@Module({})
export class AuthModule {
  static register(config: ApiRuntimeConfig): DynamicModule {
    // Existing database-only administration is shared, never a second implementation path.
    const administrationControllers = [
      PlatformController,
      PlatformInsightsController,
      PlatformReportExportController,
      UserController,
      SuperAdminController,
    ];
    const administrationProviders: Provider[] = [
      PlatformRepository,
      PlatformService,
      PlatformInsightsRepository,
      PlatformInsightsService,
      PlatformReportExportService,
      ReportExportService,
      ReportExportRepository,
      UserRepository,
      UserService,
      SuperAdminService,
      SuperAdminRepository,
    ];
    const coreControllers = [
      AuthController,
      PasswordChangeController,
      MeController,
      ContactController,
      GroupController,
      BootstrapController,
    ];
    const coreProviders: Provider[] = [
      SignupAttemptRepository,
      EmbeddedSignupRepository,
      EmbeddedSignupService,
      MetaEmbeddedSignupAdapter,
      {
        provide: ProviderCredentialPersistenceService,
        useFactory: (pool: Pool, transactions: DatabaseTransactionManager) =>
          new ProviderCredentialPersistenceService(
            new ProviderCredentialRepository(pool),
            transactions,
            new ProviderCredentialCipher(config.credentialEncryption),
          ),
        inject: [DATABASE_POOL, DatabaseTransactionManager],
      },
      {
        provide: ProviderCredentialService,
        useFactory: (pool: Pool) =>
          new ProviderCredentialService(
            new ProviderCredentialRepository(pool),
            new ProviderCredentialCipher(config.credentialEncryption),
            new EnvironmentCredentialReferenceResolver(config.meta?.developmentAccessToken),
          ),
        inject: [DATABASE_POOL],
      },
      {
        provide: WHATSAPP_ONBOARDING_CONFIG,
        useValue: {
          whatsappOnboarding: config.whatsappOnboarding,
          meta: config.meta,
          credentialEncryption: config.credentialEncryption,
          queuePrefix: config.redis.queuePrefix,
        },
      },
      WhatsAppOnboardingService,
      { provide: BOOTSTRAP_SECRET, useValue: config.authentication.bootstrapSecret ?? null },
      { provide: SeedRepository, useFactory: () => new SeedRepository() },
      BootstrapRepository,
      BootstrapService,
      { provide: AUTH_CONFIG, useValue: mapAuthModuleConfig(config) },
      { provide: DEPLOYMENT_MODE, useValue: config.deploymentMode ?? "full" },
      AccessTokenService,
      AccessTokenGuard,
      ApprovedOriginGuard,
      Argon2idPasswordHasher,
      AuthRepository,
      AuthService,
      PasswordChangeService,
      PasswordChangeRepository,
      AuthorizationRepository,
      AuthorizationService,
      LoginRateLimiterAdapter,
      MeRepository,
      MeService,
      PermissionGuard,
      RefreshTokenService,
      TenantContentGuard,
      TenantScopeService,
      TenantRoleProvisioningService,
      ContactRepository,
      ContactService,
      GroupRepository,
      GroupService,
    ];
    const coreExports = [
      AccessTokenGuard,
      AuthorizationService,
      PermissionGuard,
      TenantContentGuard,
      TenantScopeService,
    ];
    // Storage-free authoring reuses existing workflows. Worker-backed commands fail closed
    // inside campaign services; imports, Inbox, automation and webhooks remain unregistered.
    if (config.deploymentMode === "preview") {
      return {
        module: AuthModule,
        controllers: [
          ...coreControllers,
          ...administrationControllers,
          TenantInsightsController,
          TenantReportExportController,
          WhatsAppController,
          TemplateController,
          CampaignController,
        ],
        providers: [
          ...coreProviders,
          ...administrationProviders,
          TenantInsightsRepository,
          TenantInsightsService,
          TenantReportExportService,
          CampaignExportRepository,
          CampaignRepository,
          CampaignService,
          CampaignLifecycleRepository,
          CampaignLifecycleService,
          OutboxRepository,
          TemplateRepository,
          TemplateService,
          WhatsAppRepository,
          WhatsAppService,
          {
            provide: WHATSAPP_PROVIDER,
            useFactory: (credentials: ProviderCredentialService) =>
              new MetaWhatsAppProviderAdapter(
                config.meta ?? {
                  graphApiVersion: undefined,
                  appId: undefined,
                  appSecret: undefined,
                  webhookVerifyToken: undefined,
                  developmentAccessToken: undefined,
                },
                credentials,
              ),
            inject: [ProviderCredentialService],
          },
        ],
        exports: coreExports,
      };
    }
    return {
      module: AuthModule,
      controllers: [
        ...administrationControllers,
        TenantInsightsController,
        TenantReportExportController,
        WhatsAppController,
        TemplateController,
        // Register the static /contacts/imports routes before /contacts/:contactId.
        ContactImportController,
        ...coreControllers,
        CampaignController,
        ConversationController,
        ConversationCollaborationController,
        AutomationController,
        AutomationControlController,
        ConversationAutomationController,
      ],
      providers: [
        ...coreProviders,
        ...administrationProviders,
        TenantInsightsRepository,
        TenantInsightsService,
        TenantReportExportService,
        CampaignExportRepository,
        CampaignRepository,
        CampaignService,
        CampaignLifecycleRepository,
        CampaignLifecycleService,
        ConversationRepository,
        ConversationService,
        ConversationReplyService,
        ConversationNoteRepository,
        ConversationCollaborationService,
        AutomationRepository,
        AutomationService,
        AutomationRunRepository,
        AutomationControlService,
        ClamAvScanner,
        ContactImportRepository,
        {
          provide: S3ObjectStorage,
          useFactory: () => new S3ObjectStorage(config.storage),
        },
        {
          provide: ClamAvScanner,
          useFactory: () => new ClamAvScanner(config.malwareScanner),
        },
        {
          provide: ContactImportService,
          useFactory: (
            repository: ContactImportRepository,
            groups: GroupRepository,
            transactions: DatabaseTransactionManager,
            outbox: OutboxRepository,
            tenantScope: TenantScopeService,
            scanner: ClamAvScanner,
            storage: S3ObjectStorage,
          ) =>
            new ContactImportService(
              repository,
              groups,
              transactions,
              outbox,
              tenantScope,
              scanner,
              storage,
              config.uploads,
            ),
          inject: [
            ContactImportRepository,
            GroupRepository,
            DatabaseTransactionManager,
            OutboxRepository,
            TenantScopeService,
            ClamAvScanner,
            S3ObjectStorage,
          ],
        },
        TemplateRepository,
        TemplateService,
        MessagingRepository,
        MessagingService,
        {
          provide: WHATSAPP_PROVIDER,
          useFactory: (credentials: ProviderCredentialService) =>
            new MetaWhatsAppProviderAdapter(config.meta, credentials),
          inject: [ProviderCredentialService],
        },
        WhatsAppRepository,
        WhatsAppService,
      ],
      exports: [...coreExports, MessagingService],
    };
  }
}
