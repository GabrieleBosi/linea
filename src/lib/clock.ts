import { DEMO_DATE } from '@/config/demo'
import { fixedDateClock, realClock, type Clock } from '@/services/context'
import { isStaticBuild } from './mode'

/** The static build runs on the demo date; the full-stack build runs on the real date. */
export const appClock: Clock = isStaticBuild ? fixedDateClock(DEMO_DATE) : realClock
