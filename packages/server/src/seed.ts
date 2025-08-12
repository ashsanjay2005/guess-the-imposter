import type { QuestionPair } from './types';

export const SEED_PAIRS: QuestionPair[] = [
  {
    id: 'sleep_phone',
    majorityQuestion: 'How many hours of sleep do you usually get on a weeknight?',
    imposterQuestion: 'How many hours a day do you spend on your phone?',
    difficulty: 'easy',
  },
  {
    id: 'first_vs_dream_car',
    majorityQuestion: 'What was the first car you ever owned?',
    imposterQuestion: 'What is your dream car?',
    difficulty: 'easy',
  },
  {
    id: 'breakfast_vs_lunch',
    majorityQuestion: 'What do you usually eat for breakfast on weekdays?',
    imposterQuestion: 'What do you usually eat for lunch on weekdays?',
    difficulty: 'easy',
  },
  {
    id: 'favorite_color_vs_room_color',
    majorityQuestion: 'What is your favorite color?',
    imposterQuestion: 'What color are the walls in your bedroom?',
    difficulty: 'medium',
  },
  {
    id: 'city_temp_vs_room_temp',
    majorityQuestion: "What's the typical daytime temperature where you live right now?",
    imposterQuestion: 'What temperature do you set your AC to at home?',
    difficulty: 'medium',
  },
  {
    id: 'last_movie_vs_favorite_actor',
    majorityQuestion: 'What was the last movie you watched?',
    imposterQuestion: 'Who is your favorite actor?',
    difficulty: 'medium',
  },
  {
    id: 'coffee_freq_vs_tea_freq',
    majorityQuestion: 'How many cups of coffee do you drink per day?',
    imposterQuestion: 'How many cups of tea do you drink per day?',
    difficulty: 'hard',
  },
  {
    id: 'pet_age_vs_you_age',
    majorityQuestion: 'How old is your pet?',
    imposterQuestion: 'How old are you?',
    difficulty: 'hard',
  },
  {
    id: 'work_start_vs_gym_start',
    majorityQuestion: 'What time do you usually start work or class?',
    imposterQuestion: 'What time do you usually start your workout?',
    difficulty: 'hard',
  },
];


