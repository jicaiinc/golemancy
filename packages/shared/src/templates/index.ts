import type { ProjectTemplate } from '../types/template'
import { writingAssistantTemplate } from './projects/writing-assistant'
import { deepResearchTemplate } from './projects/deep-research'
import { smartSecretaryTemplate } from './projects/smart-secretary'
import { translatorTemplate } from './projects/translator'
import { knowledgeExplorerTemplate } from './projects/knowledge-explorer'
import { lifeManagerTemplate } from './projects/life-manager'
import { docHubTemplate } from './projects/doc-hub'
import { socialMediaOpsTemplate } from './projects/social-media-ops'
import { customerServiceTemplate } from './projects/customer-service'
import { legalComplianceTemplate } from './projects/legal-compliance'
import { productMgmtTemplate } from './projects/product-mgmt'
import { recruitmentTemplate } from './projects/recruitment'
import { contentMarketingTemplate } from './projects/content-marketing'
import { seoOptimizerTemplate } from './projects/seo-optimizer'
import { salesPipelineTemplate } from './projects/sales-pipeline'
import { financialMgmtTemplate } from './projects/financial-mgmt'
import { dataAnalyticsTemplate } from './projects/data-analytics'
import { academicResearchTemplate } from './projects/academic-research'

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  writingAssistantTemplate,
  deepResearchTemplate,
  smartSecretaryTemplate,
  translatorTemplate,
  knowledgeExplorerTemplate,
  lifeManagerTemplate,
  docHubTemplate,
  socialMediaOpsTemplate,
  customerServiceTemplate,
  legalComplianceTemplate,
  productMgmtTemplate,
  recruitmentTemplate,
  contentMarketingTemplate,
  seoOptimizerTemplate,
  salesPipelineTemplate,
  financialMgmtTemplate,
  dataAnalyticsTemplate,
  academicResearchTemplate,
]

export function getProjectTemplate(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find(t => t.id === id)
}
