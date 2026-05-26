# Training App Template Product Plan

Soteria Forge is a reusable foundation for a mobile-first LMS or professional development app. It is designed for short lessons, practical quizzes, scenario-based practice, progress tracking, PWA installation, and future manager reporting.

## Core Experience

- Employees log in with a name and role.
- Employees see assigned training paths and next lesson.
- Video lessons can use embedded providers such as Synthesia, YouTube, Vimeo, or a private video host.
- Quizzes reinforce knowledge checks.
- Scenario games reinforce behavior and decision-making.
- Leaderboards provide optional friendly competition.
- Goals help learners turn training into action.

## Reusable Modules

- Login and branded app shell
- Dashboard metrics
- Training path selector
- Video lesson layout
- Quiz layout
- Phaser scenario game wrapper
- Leaderboard
- Goals
- Lightweight manager reporting screen
- PWA manifest/service worker
- Capacitor mobile configuration

## Customization Checklist

- Rename app and package identifiers.
- Replace logo and PWA icons.
- Update theme colors.
- Replace sample lessons, quiz questions, and game prompts.
- Replace placeholder video thumbnail and embed URL.
- Connect real authentication when needed.
- Connect real users, assignments, attempts, and completion records in MongoDB.
- Regenerate Android/iOS projects after final app ID and app name are chosen.

## Suggested Next Data Models

- User
- TrainingPath
- Lesson
- QuizAttempt
- GameAttempt
- Goal
- Assignment
- CompletionRecord

## Notes

This template is intentionally not client-specific. Keep client logos, proprietary training copy, and production credentials out of the template. Create a new project from this starter, then brand and configure it for each separate LMS project.
