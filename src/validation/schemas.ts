import { z } from 'zod';

import { ACTIVITY_TYPES } from '@/domain/activity-types';
import { MAX_DISTANCE_M, eligibilityProblem } from '@/domain/activity-rules';
import { parseDurationInput } from '@/domain/units';

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.');

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(72, 'Use at most 72 characters.')
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/[0-9]/, 'Include at least one number.');

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});
export type SignInValues = z.infer<typeof signInSchema>;

export const signUpSchema = z
  .object({
    displayName: z.string().trim().min(1, 'Tell us what to call you.').max(50, 'Keep it under 50 characters.'),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });
export type SignUpValues = z.infer<typeof signUpSchema>;

export const otpSchema = z.object({
  token: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'),
});

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/, '3–24 characters: lowercase letters, numbers and underscores.');

export const profileSchema = z.object({
  displayName: z.string().trim().min(1, 'Required.').max(50, 'Keep it under 50 characters.'),
  username: usernameSchema,
  bio: z.string().trim().max(280, 'Keep it under 280 characters.').optional(),
  fitnessGoal: z.string().trim().max(140, 'Keep it under 140 characters.').optional(),
});
export type ProfileValues = z.infer<typeof profileSchema>;

const activityTypeSchema = z.enum(ACTIVITY_TYPES);

export const manualActivitySchema = z
  .object({
    type: activityTypeSchema,
    title: z.string().trim().max(100, 'Keep it under 100 characters.').optional(),
    description: z.string().trim().max(2000, 'Keep it under 2,000 characters.').optional(),
    startedAt: z.date(),
    duration: z.string().refine((v) => {
      const s = parseDurationInput(v);
      return s !== null && s >= 30 && s <= 48 * 3600;
    }, 'Enter a duration like 45, 32:10 or 1:05:00 (30 s to 48 h).'),
    /** In the user's display unit (km or mi). */
    distance: z
      .string()
      .trim()
      .refine((v) => v === '' || (/^\d+([.,]\d+)?$/.test(v) && Number(v.replace(',', '.')) >= 0), 'Enter a number, e.g. 5.2.'),
    distanceMeters: z.number().int().nonnegative(),
    visibility: z.enum(['public', 'friends', 'private']),
  })
  .superRefine((v, ctx) => {
    if (v.distanceMeters > MAX_DISTANCE_M[v.type]) {
      ctx.addIssue({ code: 'custom', path: ['distance'], message: `That is more than the ${MAX_DISTANCE_M[v.type] / 1000} km limit for this activity type.` });
    }
    const seconds = parseDurationInput(v.duration);
    if (seconds && v.startedAt.getTime() + seconds * 1000 > Date.now() + 10 * 60_000) {
      ctx.addIssue({ code: 'custom', path: ['startedAt'], message: 'The activity cannot end in the future.' });
    }
    if (v.startedAt.getTime() < Date.now() - 365 * 86_400_000) {
      ctx.addIssue({ code: 'custom', path: ['startedAt'], message: 'Activities older than one year cannot be added.' });
    }
    if (seconds && v.distanceMeters > 0) {
      const problem = eligibilityProblem(v.type, v.distanceMeters, seconds);
      if (problem) ctx.addIssue({ code: 'custom', path: ['distance'], message: problem });
    }
  });
export type ManualActivityValues = z.infer<typeof manualActivitySchema>;

export const challengeFormSchema = z
  .object({
    title: z.string().trim().min(3, 'At least 3 characters.').max(80, 'Keep it under 80 characters.'),
    description: z.string().trim().max(1000, 'Keep it under 1,000 characters.').optional(),
    mode: z.enum(['individual', 'competitive', 'collaborative', 'team']),
    metric: z.enum(['distance', 'duration', 'count']),
    /** Display-unit goal: km/mi for distance, hours for duration, count for activities. */
    goal: z.string().trim(),
    activityTypes: z.array(activityTypeSchema).min(1, 'Pick at least one activity type.'),
    window: z.enum(['weekly', 'monthly', 'yearly', 'custom']),
    recurring: z.boolean(),
    customStart: z.date().nullable(),
    customEnd: z.date().nullable(),
    visibility: z.enum(['public', 'private']),
    allowManual: z.boolean(),
    teams: z.array(z.object({ name: z.string().trim().min(2, 'Team names need 2+ characters.').max(30), color: z.string() })),
  })
  .superRefine((v, ctx) => {
    const goal = Number(v.goal.replace(',', '.'));
    const needsGoal = v.mode === 'individual' || v.mode === 'collaborative';
    if (v.goal === '' && needsGoal) ctx.addIssue({ code: 'custom', path: ['goal'], message: 'This challenge type needs a goal.' });
    if (v.goal !== '' && (!Number.isFinite(goal) || goal <= 0)) ctx.addIssue({ code: 'custom', path: ['goal'], message: 'Enter a positive number.' });
    if (v.window === 'custom') {
      if (!v.customStart || !v.customEnd) ctx.addIssue({ code: 'custom', path: ['customEnd'], message: 'Pick start and end dates.' });
      else if (v.customEnd < v.customStart) ctx.addIssue({ code: 'custom', path: ['customEnd'], message: 'The end date must be after the start date.' });
      else if (v.customEnd.getTime() - v.customStart.getTime() > 366 * 86_400_000) ctx.addIssue({ code: 'custom', path: ['customEnd'], message: 'Challenges can last at most one year.' });
    }
    if (v.mode === 'team' && (v.teams.length < 2 || v.teams.length > 6)) {
      ctx.addIssue({ code: 'custom', path: ['teams'], message: 'Team challenges need two to six teams.' });
    }
    const names = v.teams.map((t) => t.name.trim().toLowerCase());
    if (v.mode === 'team' && new Set(names).size !== names.length) {
      ctx.addIssue({ code: 'custom', path: ['teams'], message: 'Team names must be unique.' });
    }
  });
export type ChallengeFormValues = z.infer<typeof challengeFormSchema>;
