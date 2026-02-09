/**
 * Test user fixtures (IDs/emails). Use after seeding or create in integration tests.
 */
export const TEST_USERS = {
  director: {
    email: "director@test.local",
    role: "Director",
  },
  hr: {
    email: "hr@test.local",
    role: "HR",
  },
} as const;
