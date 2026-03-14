import type { ProjectTemplate } from '../../types/template'

export const socialMediaOpsTemplate: ProjectTemplate = {
  id: 'social-media-ops',
  category: 'creative',
  icon: 'phone',
  name: 'Social Media Operations',
  description: 'Multi-platform social media account management with AI-powered content strategy and community engagement',
  tags: ['social-media', 'community', 'engagement', 'analytics'],
  featured: true,

  skills: [
    {
      refId: 'twitter-algorithm-optimizer',
      name: 'Twitter Algorithm Optimizer',
      description: 'Optimize content for maximum reach on Twitter/X by understanding and leveraging the platform algorithm',
      instructions: `# Twitter Algorithm Optimizer

Optimize content for maximum reach on Twitter/X by understanding and leveraging the platform's recommendation algorithm.

## Algorithm Signals (Ranked by Weight)

### Engagement Velocity (Highest Weight)
- First 30 minutes after posting determine 80% of reach
- Likes, replies, retweets, and bookmarks all count — but replies and bookmarks weight more
- Self-replies (threads) boost engagement if each tweet adds value

### Content Type Ranking
1. **Long-form posts** (>280 chars) — highest organic reach
2. **Image posts** — strong visual signal
3. **Threads** — high engagement if well-structured
4. **Videos** — boosted in dedicated tab, moderate feed reach
5. **Links** — deprioritized in feed (post link in reply instead)

### Profile Authority Signals
- Follower/following ratio matters — curate who you follow
- Consistent posting schedule (3-7x/day ideal)
- Profile completeness (bio, header, pinned tweet)
- Blue checkmark provides minor boost

## Posting Strategy

### Optimal Timing
- Know your audience timezone — post when they're active
- Weekdays: 8-10am, 12-1pm, 5-7pm (audience local time)
- Weekends: 9-11am performs well

### Thread Formula
1. **Hook tweet** — bold claim, surprising stat, or contrarian take
2. **Context** — why this matters (1-2 tweets)
3. **Core content** — the meat (3-5 tweets)
4. **Takeaway** — actionable summary
5. **CTA** — follow, retweet, reply prompt

### Engagement Hacks
- Ask questions (drives replies, highest-weight signal)
- Use "bookmark this" CTAs (bookmarks heavily weighted)
- Quote-tweet your own content with new insights
- Reply to large accounts with valuable additions
- Use 1-3 hashtags max (more looks spammy)

## Content Optimization Checklist

- [ ] First line is a hook (curiosity gap, number, bold claim)
- [ ] No external links in main tweet (put in reply)
- [ ] At least 100 characters (longer posts favored)
- [ ] Clear CTA (reply, bookmark, follow)
- [ ] Posted during peak hours for target audience
- [ ] No more than 3 hashtags
- [ ] Thread has a strong hook tweet if multi-part

## Analytics to Track

| Metric | Target | Why |
|--------|--------|-----|
| Impression-to-engagement rate | >5% | Content quality signal |
| Reply rate | >1% | Highest-weight algorithm signal |
| Bookmark rate | >0.5% | Strong quality signal |
| Follower growth rate | >1%/week | Compounding reach |
| Link click rate | >2% | Conversion effectiveness |`,
    },
    {
      refId: 'social-media-analyzer',
      name: 'Social Media Analyzer',
      description: 'Analyze social media performance metrics across platforms and generate actionable insights',
      instructions: `# Social Media Analyzer

Analyze social media performance data across platforms to identify patterns, optimize strategy, and generate actionable recommendations.

## Analysis Framework

### 1. Performance Metrics Dashboard

For each platform, track and analyze:

**Reach Metrics:**
- Impressions (total views)
- Reach (unique viewers)
- Follower growth (net new / churned)
- Share of voice (vs. competitors)

**Engagement Metrics:**
- Engagement rate = (likes + comments + shares + saves) / reach × 100
- Comment-to-like ratio (higher = deeper engagement)
- Save/bookmark rate (content quality proxy)
- Average engagement per post

**Conversion Metrics:**
- Click-through rate (CTR)
- Profile visits from content
- DM inquiries generated
- Website traffic from social

### 2. Content Performance Analysis

**Top-Performing Content Audit:**
- Identify top 10% posts by engagement rate
- Extract common patterns: topic, format, length, timing, visuals
- Determine content pillars that resonate most

**Underperforming Content Diagnosis:**
- Bottom 10% posts — what went wrong?
- Common failure patterns: timing, topic mismatch, weak hooks

**Format Comparison:**
| Format | Avg Reach | Avg Engagement | Best For |
|--------|-----------|----------------|----------|
| Carousel | — | — | Education |
| Single image | — | — | Quick tips |
| Video/Reel | — | — | Personality |
| Text-only | — | — | Hot takes |
| Thread | — | — | Deep dives |

### 3. Audience Insights

- Active hours (when followers are online)
- Demographics (age, location, language)
- Interest overlap (what else they follow)
- Growth sources (organic, paid, viral, cross-platform)

### 4. Competitive Benchmarking

- Competitor posting frequency and timing
- Content themes and formats they use
- Engagement rates comparison
- Audience overlap analysis
- Content gaps (topics they miss that you can own)

## Report Templates

### Weekly Performance Report
1. Key metrics vs. previous week (with % change)
2. Top 3 performing posts with analysis
3. Worst performing post with diagnosis
4. Audience growth summary
5. Recommendations for next week

### Monthly Strategic Report
1. Month-over-month trend analysis
2. Content pillar performance breakdown
3. Platform-by-platform comparison
4. Competitive landscape update
5. Strategic recommendations (double down / experiment / stop)

### Quarterly Business Review
1. Quarter-over-quarter growth trajectory
2. ROI analysis (if paid campaigns)
3. Audience persona refinement
4. Content strategy evolution
5. Goals and KPIs for next quarter

## Actionable Recommendations Framework

Always tie insights to specific actions:
- **If reach is declining** → Audit posting times, experiment with new formats, check for algorithm changes
- **If engagement rate drops** → Review content mix, increase interactive content (polls, questions), check audience fatigue
- **If follower growth stalls** → Increase collaboration, try new content pillars, analyze unfollow reasons
- **If CTR is low** → Improve CTAs, test different link placement strategies, align content with landing pages`,
    },
    {
      refId: 'social-content',
      name: 'Social Content',
      description: 'Create platform-specific social media content with optimal formats, hooks, and posting strategies',
      instructions: `# Social Content

Create engaging, platform-optimized social media content that drives reach, engagement, and conversions.

## Platform Quick Reference

| Platform | Best For | Frequency | Key Format |
|----------|----------|-----------|------------|
| LinkedIn | B2B, thought leadership | 3-5x/week | Carousels, stories |
| Twitter/X | Tech, real-time, community | 3-10x/day | Threads, hot takes |
| Instagram | Visual brands, lifestyle | 1-2 posts + Stories daily | Reels, carousels |
| TikTok | Brand awareness, younger audiences | 1-4x/day | Short-form video |
| Xiaohongshu | Lifestyle, reviews, tutorials | 3-5x/week | Photo essays, guides |
| WeChat (公众号) | Long-form, loyal audience | 1-4x/week | Articles, newsletters |

## Content Pillars Framework

Build content around 3-5 pillars:

| Pillar | % of Content | Purpose |
|--------|:---:|---------|
| Industry insights | 30% | Establish authority |
| Behind-the-scenes | 25% | Build connection |
| Educational | 25% | Provide value |
| Personal/Stories | 15% | Create relatability |
| Promotional | 5% | Drive conversions |

## Hook Formulas

**Curiosity:** "I was wrong about [belief]." / "[Result] — only took [short time]."
**Story:** "Last week, [unexpected thing]." / "3 years ago, [past]. Today, [now]."
**Value:** "How to [outcome] (without [pain]):" / "[Number] [things] that [outcome]:"
**Contrarian:** "Unpopular opinion: [bold statement]" / "Stop [common advice]. Do [this] instead."

## Platform-Specific Formats

### LinkedIn
- **Hook**: First line must stop the scroll (no more than 150 chars)
- **Body**: Use line breaks generously. One idea per paragraph. 1-3 sentences max per block.
- **CTA**: Ask a question or invite discussion
- **Carousel**: 8-12 slides, one key point per slide, bold headlines

### Twitter/X
- **Single tweet**: Lead with the hook. Max impact in 280 chars.
- **Thread**: Hook tweet → Context → 3-5 value tweets → Summary → CTA
- **Quote tweet**: Add unique insight, don't just agree

### Instagram
- **Carousel**: Cover slide (hook) → 5-8 content slides → CTA slide
- **Reel**: Hook in first 3 seconds → Value → CTA. 30-60 seconds ideal.
- **Caption**: First line is the hook. Use paragraphs. Hashtags at end (10-15).

### Xiaohongshu
- **Title**: Include keywords + emoji, 18-20 chars ideal
- **Cover image**: Clean, eye-catching, text overlay
- **Body**: Structured with emoji bullets, practical tips
- **Tags**: 5-10 relevant tags

## Content Repurposing

One piece → many formats:
- Blog post → LinkedIn article + Twitter thread + Instagram carousel
- Podcast → Quote graphics + Short video clips + Thread summary
- Case study → Before/after post + Carousel + Video testimonial

## Weekly Content Calendar Template

| Day | LinkedIn | Twitter/X | Instagram |
|-----|----------|-----------|-----------|
| Mon | Industry insight | Hot take thread | Educational carousel |
| Tue | Behind-scenes story | Engagement tweets | Story polls |
| Wed | Educational post | Tips thread | Reel |
| Thu | Case study/results | Thread | Behind-scenes |
| Fri | Personal story/hot take | Engagement | Story recap |`,
    },
  ],

  agents: [
    {
      refId: 'social-manager',
      name: 'Social Media Manager',
      description: 'Oversees multi-platform social media strategy, content scheduling, and performance analysis',
      systemPrompt: `You are a social media manager who oversees multi-platform account strategy. You plan posting schedules, analyze performance metrics, identify trending topics, and set content direction. You know platform algorithms for Twitter/X, LinkedIn, Xiaohongshu, WeChat, and Instagram. You optimize posting times and content formats for maximum organic reach.

## Your Role

- **Strategy** — Define content pillars, posting cadence, and platform priorities based on business goals
- **Scheduling** — Plan weekly content calendars with optimal posting times per platform
- **Analytics** — Track engagement rates, follower growth, reach, and conversion metrics
- **Trend monitoring** — Spot trending topics and viral formats to capitalize on
- **Quality control** — Ensure all content aligns with brand voice and strategy

## How You Work

1. **Understand the brand** — Clarify target audience, voice, goals, and current platform presence
2. **Set the strategy** — Define content pillars, posting frequency, and KPIs per platform
3. **Plan content** — Create weekly calendars with specific topics, formats, and posting times
4. **Coordinate** — Direct the Community Manager on engagement priorities
5. **Review performance** — Analyze what's working, adjust strategy based on data

## Standards

- Data-driven decisions — every strategy change backed by metrics
- Platform-native content — never post the same thing everywhere
- Consistency over perfection — regular posting beats occasional viral hits
- Audience-first — what value does each post provide to followers?`,
      skillRefs: ['twitter-algorithm-optimizer', 'social-media-analyzer', 'social-content'],
      mcpRefs: ['playwright', 'open-websearch', 'memory'],
      builtinTools: { memory: true, browser: true },
    },
    {
      refId: 'community-manager',
      name: 'Community Manager',
      description: 'Handles audience engagement, comment management, and community relationship building',
      systemPrompt: `You are a community manager who handles audience engagement. You craft thoughtful replies to comments, DMs, and mentions. You identify and nurture brand advocates, handle negative comments diplomatically, and escalate genuine complaints. You maintain the brand's voice in all community interactions. You track sentiment trends and report anomalies.

## Your Role

- **Engagement** — Respond to comments, DMs, and mentions across all platforms
- **Relationship building** — Identify and nurture brand advocates and superfans
- **Crisis management** — Handle negative feedback diplomatically, escalate when needed
- **Sentiment tracking** — Monitor audience mood and flag shifts
- **Community growth** — Foster discussions and build a sense of belonging

## How You Work

1. **Daily engagement sweep** — Check all platforms for new comments, mentions, and DMs
2. **Prioritize responses** — Negative/urgent first, then questions, then positive engagement
3. **Craft on-brand replies** — Match the brand's tone while being authentic and helpful
4. **Escalate appropriately** — Flag genuine product issues, PR risks, or abusive users
5. **Report insights** — Surface recurring themes, questions, and sentiment shifts to the Social Media Manager

## Response Guidelines

- **Positive comments** — Thank genuinely, add value, don't be generic
- **Questions** — Answer directly, link to resources if available
- **Complaints** — Acknowledge, empathize, offer solution, move to DM if needed
- **Trolls** — Don't engage emotionally, one factual response max, then disengage
- **Feature requests** — Thank, note for product team, don't make promises

## Daily Routine (30-45 min per platform)

1. Clear notification queue (respond to everything)
2. Proactively comment on 5-10 accounts in target audience
3. Share/repost relevant content with added insight
4. Send 2-3 DMs to new meaningful connections
5. Log any sentiment anomalies or recurring themes`,
      skillRefs: ['social-content'],
      mcpRefs: ['playwright', 'open-websearch', 'memory'],
      builtinTools: { memory: true, browser: true },
    },
  ],

  teams: [
    {
      refId: 'social-media-ops-team',
      name: 'Social Media Operations Team',
      description: 'Social Media Manager coordinates Community Manager for comprehensive multi-platform social media operations',
      instruction: 'Social Media Manager sets content strategy and publishing schedules. Community Manager handles all audience interaction and engagement. Coordinate daily on trending topics and audience sentiment.',
      members: [
        { agentRef: 'social-manager' },
        { agentRef: 'community-manager', parentAgentRef: 'social-manager' },
      ],
    },
  ],

  mcpServers: [
    {
      refId: 'playwright',
      name: 'playwright',
      description: 'Browser automation for social media interaction and research',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp', '--headless'],
    },
    {
      refId: 'open-websearch',
      name: 'open-websearch',
      description: 'Free web search for trend monitoring and competitive research',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', 'open-websearch'],
    },
    {
      refId: 'memory',
      name: 'memory',
      description: 'Persistent knowledge graph for audience insights and brand voice',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  ],

  cronJobs: [
    {
      refId: 'daily-engagement-check',
      name: 'Daily Engagement Check',
      description: 'Check platform notifications and interactions, generate daily engagement task list',
      schedule: '0 9 * * *',
      targetType: 'team',
      targetRef: 'social-media-ops-team',
      prompt: 'Check all platform notifications and interactions. Generate today\'s engagement task list including pending replies, trending topics to capitalize on, and scheduled content to review.',
      enabled: true,
    },
    {
      refId: 'weekly-analytics-report',
      name: 'Weekly Analytics Report',
      description: 'Generate weekly social media performance analysis report',
      schedule: '0 9 * * 1',
      targetType: 'team',
      targetRef: 'social-media-ops-team',
      prompt: 'Generate last week\'s social media analytics report: engagement rates, follower growth, top-performing content, and recommendations for this week\'s content strategy.',
      enabled: true,
    },
  ],

  defaultTarget: { type: 'team', ref: 'social-media-ops-team' },
}
