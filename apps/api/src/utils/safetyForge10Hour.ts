const vimeoPlaceholderUrl = 'https://vimeo.com/000000000'

export const safetyForgeDisclaimer =
  'Safety FORGE 10 Hour is an OSHA-aligned construction safety awareness course shell. It is not an official OSHA Outreach Training Program class and does not issue a Department of Labor card unless delivered through an authorized trainer or authorized provider workflow.'

const sharedOutcomes = [
  'Recognize common construction hazards with emphasis on hazard identification, avoidance, control, and prevention.',
  'Explain worker rights, employer responsibilities, and how to raise safety concerns.',
  'Apply field-ready checks for Focus Four hazards, PPE, health hazards, tools, ladders, scaffolds, and materials handling.',
  'Complete knowledge checks, offline support review, final assessment, and supervisor practical signoff.',
]

function questions(topic: string) {
  return [
    {
      id: `${topic}-q1`,
      prompt: 'What should a learner do when a serious uncontrolled hazard is identified?',
      options: ['Keep working and mention it later', 'Stop, warn affected workers, and escalate through the site process', 'Only document it after the shift'],
      answer: 'Stop, warn affected workers, and escalate through the site process',
      coaching: 'Safety FORGE emphasizes stop-work authority, early communication, and escalation before exposure continues.',
    },
    {
      id: `${topic}-q2`,
      prompt: 'Which learning record matters most for an audit-ready course shell?',
      options: ['A clicked start button only', 'Completion, time-on-topic, quiz, xAPI, and signoff evidence', 'A handwritten note with no learner identity'],
      answer: 'Completion, time-on-topic, quiz, xAPI, and signoff evidence',
      coaching: 'Compliance-style delivery needs durable evidence for who completed what, when, and under which course requirements.',
    },
    {
      id: `${topic}-q3`,
      prompt: 'What should happen if a field learner loses connectivity?',
      options: ['The learner must restart the course', 'Progress should queue locally and sync later', 'The module should be marked complete automatically'],
      answer: 'Progress should queue locally and sync later',
      coaching: 'Field-ready delivery preserves attempts and completions through an offline queue and idempotent sync.',
    },
  ]
}

function moduleShell(input: {
  topicCode: string
  title: string
  description: string
  minutes: number
  videoMinutes: number
  quizMinutes: number
  reflectionMinutes: number
  activePrompt: string
}) {
  return {
    title: input.title,
    description: input.description,
    moduleTopicCode: input.topicCode,
    contactHourTargetMinutes: input.minutes,
    minimumSeatTimeMinutes: input.minutes,
    sequenceLocked: true,
    lessons: [
      {
        kind: 'video',
        title: `${input.title} briefing`,
        description: 'Vimeo placeholder lesson. Replace with the final authored video before launch.',
        durationMinutes: input.videoMinutes,
        minimumSeatTimeMinutes: input.videoMinutes,
        required: true,
        vimeoUrl: vimeoPlaceholderUrl,
        activeEngagementPrompt: input.activePrompt,
        transcript: `Transcript placeholder for ${input.title}. Add the final narration transcript when the Vimeo lesson is linked.`,
        offlineSummary: `${input.title}: offline summary placeholder with field checklist, key hazards, and supervisor talking points.`,
        languageVariants: ['en', 'es-ready'],
      },
      {
        kind: 'quiz',
        title: `${input.title} knowledge check`,
        description: 'Three-question checkpoint to confirm hazard recognition and course-record understanding.',
        durationMinutes: input.quizMinutes,
        minimumSeatTimeMinutes: input.quizMinutes,
        required: true,
        passingScore: 80,
        attemptLimit: 3,
        activeEngagementPrompt: 'Answer each question before moving to the next required lesson.',
        quizQuestions: questions(input.topicCode.toLowerCase()),
        languageVariants: ['en', 'es-ready'],
      },
      {
        kind: 'reflection',
        title: `${input.title} field reflection`,
        description: 'Learner identifies one site-specific hazard or control connected to this module.',
        durationMinutes: input.reflectionMinutes,
        minimumSeatTimeMinutes: input.reflectionMinutes,
        required: true,
        activeEngagementPrompt: 'Write down where this hazard could appear on your next job site.',
        offlineSummary: 'Reflection can be completed offline and synced when connectivity returns.',
        languageVariants: ['en', 'es-ready'],
      },
    ],
  }
}

export function safetyForge10HourCourseSeed(tenantId: unknown) {
  return {
    tenantId,
    title: 'Safety FORGE 10 Hour',
    slug: 'safety-forge-10-hour',
    description:
      'A construction-focused, OSHA-aligned 10-hour safety awareness shell for hybrid async delivery, offline field support, quizzes, xAPI records, and supervisor signoff.',
    publicSummary:
      'OSHA-aligned construction safety awareness course shell with 10 hours of field-ready lessons, quizzes, offline supports, final assessment, and practical signoff.',
    audience: ['Entry-level construction workers', 'Small contractor crews', 'Jobsite supervisors assigning safety onboarding', 'Owner-operators needing safety awareness records'],
    outcomes: sharedOutcomes,
    category: 'Construction Safety',
    role: 'Construction worker',
    topic: 'OSHA-aligned 10 hour safety',
    durationMinutes: 600,
    certificateLabel: 'Safety FORGE 10 Hour Completion Record',
    complianceDisclaimers: [
      safetyForgeDisclaimer,
      'Do not market this shell as OSHA-approved, OSHA-certified, or as issuing an official OSHA/DOL card until an authorized trainer or provider workflow is in place.',
      'Videos, trainer attestations, official card processing, and any jurisdiction-specific requirements must be validated before regulated use.',
    ],
    contactHourTargetMinutes: 600,
    sequenceLocked: true,
    passingScore: 80,
    attemptLimit: 3,
    languageVariants: ['en', 'es-ready'],
    previewLessonId: undefined,
    status: 'published',
    tags: ['construction', 'osha-aligned', '10-hour', 'focus-four', 'field-ready'],
    fieldReadinessScore: 94,
    certificateExpiresInDays: 1095,
    modules: [
      moduleShell({
        topicCode: 'SF10-00',
        title: 'Welcome, Course Rules, and Safety FORGE Orientation',
        description: 'Platform walkthrough, disclaimer, completion rules, low-bandwidth expectations, and how records are captured.',
        minutes: 15,
        videoMinutes: 8,
        quizMinutes: 4,
        reflectionMinutes: 3,
        activePrompt: 'Confirm you understand that this shell is OSHA-aligned and not an official DOL card course yet.',
      }),
      moduleShell({
        topicCode: 'SF10-01',
        title: 'Introduction to OSHA and Worker Rights',
        description: 'Worker rights, employer responsibilities, reporting, complaints, and safety resources.',
        minutes: 60,
        videoMinutes: 45,
        quizMinutes: 10,
        reflectionMinutes: 5,
        activePrompt: 'Identify one worker right and one employer responsibility that apply to your job site.',
      }),
      moduleShell({
        topicCode: 'SF10-02',
        title: 'Focus Four: Falls',
        description: 'Fall hazard recognition, prevention hierarchy, ladders and scaffolds overview, and field scenarios.',
        minutes: 90,
        videoMinutes: 65,
        quizMinutes: 15,
        reflectionMinutes: 10,
        activePrompt: 'Pause and identify the highest-risk fall exposure in a realistic work area.',
      }),
      moduleShell({
        topicCode: 'SF10-03',
        title: 'Focus Four: Electrocution',
        description: 'Power sources, overhead and temporary power, grounding, GFCI awareness, and lockout awareness.',
        minutes: 45,
        videoMinutes: 30,
        quizMinutes: 10,
        reflectionMinutes: 5,
        activePrompt: 'Name one control that reduces exposure to temporary power hazards.',
      }),
      moduleShell({
        topicCode: 'SF10-04',
        title: 'Focus Four: Struck-By',
        description: 'Vehicles, dropped objects, cranes, equipment, barricades, and spotter awareness.',
        minutes: 45,
        videoMinutes: 30,
        quizMinutes: 10,
        reflectionMinutes: 5,
        activePrompt: 'Identify the exclusion zone or line-of-fire risk in a site movement scenario.',
      }),
      moduleShell({
        topicCode: 'SF10-05',
        title: 'Focus Four: Caught-In or Between',
        description: 'Trenches, moving equipment, pinch points, machinery, and excavation awareness.',
        minutes: 45,
        videoMinutes: 30,
        quizMinutes: 10,
        reflectionMinutes: 5,
        activePrompt: 'Describe how to avoid entering a pinch point or unprotected excavation exposure.',
      }),
      moduleShell({
        topicCode: 'SF10-06',
        title: 'Focus Four Field Lab and Scenario Review',
        description: 'Interactive hazard-spotting review tying all Focus Four topics together.',
        minutes: 15,
        videoMinutes: 8,
        quizMinutes: 4,
        reflectionMinutes: 3,
        activePrompt: 'Sort the scenario hazards into Falls, Electrocution, Struck-By, and Caught-In/Between.',
      }),
      moduleShell({
        topicCode: 'SF10-07',
        title: 'PPE and Lifesaving Equipment',
        description: 'PPE selection, inspection, limitations, and field readiness checklist.',
        minutes: 30,
        videoMinutes: 20,
        quizMinutes: 6,
        reflectionMinutes: 4,
        activePrompt: 'Choose PPE based on hazard first, then explain one limitation of that PPE.',
      }),
      moduleShell({
        topicCode: 'SF10-08',
        title: 'Health Hazards in Construction',
        description: 'Hazard communication, silica, noise, heat awareness, SDS orientation, and exposure controls.',
        minutes: 30,
        videoMinutes: 20,
        quizMinutes: 6,
        reflectionMinutes: 4,
        activePrompt: 'Find the signal word, hazard pictogram, or control measure in an SDS-style example.',
      }),
      {
        title: 'Electives, Final Assessment, and Supervisor Signoff',
        description:
          'Scaffold awareness, stairways and ladders, tools, materials handling, excavation awareness, final assessment, course survey, and practical signoff shell.',
        moduleTopicCode: 'SF10-09',
        contactHourTargetMinutes: 225,
        minimumSeatTimeMinutes: 225,
        sequenceLocked: true,
        lessons: [
          {
            kind: 'video',
            title: 'Construction electives briefing',
            description: 'Vimeo placeholder covering scaffolds, stairways/ladders, tools, materials handling, and excavation awareness.',
            durationMinutes: 120,
            minimumSeatTimeMinutes: 120,
            required: true,
            vimeoUrl: vimeoPlaceholderUrl,
            activeEngagementPrompt: 'Capture one job-site example for each elective topic as you watch.',
            transcript: 'Transcript placeholder for the elective briefing video.',
            offlineSummary: 'Offline elective guide: scaffolds, ladders, tools, materials handling, excavations, and job-site controls.',
            languageVariants: ['en', 'es-ready'],
          },
          {
            kind: 'document',
            title: 'Safety FORGE 10 Hour field study guide',
            description: 'Downloadable study guide placeholder for topic review, field checklist, and glossary.',
            durationMinutes: 30,
            minimumSeatTimeMinutes: 30,
            required: true,
            activeEngagementPrompt: 'Review the field checklist before starting the final assessment.',
            offlineSummary: 'Study guide asset placeholder. Attach PDF/job aid when final content is authored.',
            languageVariants: ['en', 'es-ready'],
          },
          {
            kind: 'quiz',
            title: 'Safety FORGE 10 Hour final assessment',
            description: 'Final assessment shell. Replace or expand questions when the official instructional content is authored.',
            durationMinutes: 45,
            minimumSeatTimeMinutes: 45,
            required: true,
            passingScore: 80,
            attemptLimit: 3,
            activeEngagementPrompt: 'Pass the final assessment before requesting supervisor signoff.',
            quizQuestions: [
              ...questions('sf10-final').slice(0, 3),
              {
                id: 'sf10-final-q4',
                prompt: 'Which Safety FORGE feature helps preserve records when a job site has poor signal?',
                options: ['Offline queue and later sync', 'Deleting old attempts', 'Disabling quizzes'],
                answer: 'Offline queue and later sync',
                coaching: 'The LMS is designed for austere and low-connectivity environments.',
              },
              {
                id: 'sf10-final-q5',
                prompt: 'What is this first release of Safety FORGE 10 Hour?',
                options: ['An OSHA-aligned course shell', 'An OSHA-approved certification', 'A DOL card replacement'],
                answer: 'An OSHA-aligned course shell',
                coaching: 'Official OSHA Outreach/DOL card language requires an authorized trainer or authorized provider workflow.',
              },
            ],
            languageVariants: ['en', 'es-ready'],
          },
          {
            kind: 'reflection',
            title: 'Course survey and field action plan',
            description: 'Learner records one hazard they will watch for and one control they will use on the next job.',
            durationMinutes: 10,
            minimumSeatTimeMinutes: 10,
            required: true,
            activeEngagementPrompt: 'Write one field action you can apply within the next shift.',
            offlineSummary: 'Survey and field action plan can be completed offline and synced later.',
            languageVariants: ['en', 'es-ready'],
          },
          {
            kind: 'practical-signoff',
            title: 'Supervisor practical signoff',
            description: 'Supervisor confirms the learner can apply safety awareness expectations in the field.',
            durationMinutes: 20,
            minimumSeatTimeMinutes: 20,
            required: true,
            activeEngagementPrompt: 'Supervisor verifies the learner can explain stop-work, Focus Four awareness, PPE checks, and site escalation.',
            offlineSummary: 'Signoff placeholder for field observation. Evidence uploads can be queued when offline in a later release.',
            languageVariants: ['en', 'es-ready'],
          },
        ],
      },
    ],
  }
}
