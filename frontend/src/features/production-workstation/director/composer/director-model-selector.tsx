import { ModelSelector } from "@/components/ai/model-selector"
import type { DirectorModelFamily } from "./director-composer-config"

const klingBrandIcon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAMAAAC5zwKfAAAA5FBMVEUAAAD///8DAwP6+/z7/Pz2+Pn19/f5+vv9/f77/f709fbm5+f+/v8HBwf4+fpDQ0QaGhru7+9LTExISEgWFhbn6OkuLi4iIyOBgoMzMzPy8/Pj5OXf3+Cur7AeHh7q6+vY2dnS09PNzc68vL0pKionJyfh4uLc3d3Ky8zGxse4urqwsbI9PT4PDw/P0NHExcWytLSnqKmio6RXWFhUVFUSExMMDA3U1darrK1ERUU3ODgKCQrIyMien6CGh4h7fH1qa2u/wMCUlZZ1dnZvb3CZmppoaGlcXV1SUlI6OzuNjo6LjI0VHa56AAAElklEQVRYw+2Ya1faQBCGebPZSyDBcJX7XRARAUFB8dZqq23////phEIRWZbU9lvd4zlZsuOTdzKTmWwiH+Nj/K/DS2dPU6nTrG/9A1j/uRxjWA6n2HtOvxtFci5yGUAx5jiu6yrHoRlQeuzT2nt4384IJhXA293e+XmvW+KAE2fASUWLNOOuY5BcodAbv7p1/mQoYHOG5qUGacL1G4hz155ltxevu7AFwwNZhec90P8o/ujpV9NluhpqlmWF5Z2BJORopl2lNHoCkxKtkCIvhC1Qv9yB6z+cSUC5LuNIhiIeBf58JVOduPwAQGHw+f5+lEEUkxDELLhUh3reaRGo3vur6CiBVgh9ghU8y9LgDkvAILs+YXlMVPfFo0/6EhEdzhoC3fRGoKxTIL8nvoW4FFpeysbU3zqbcD+beZ8cjrmO14Q7exnW2p1PudYrlWU0jAqTiCKvwVWiinMAiikAmXW23KFkFAiBOzq8PT2GsJG4Tflzz/NfjoHjlVHOBCQHHFnU8L6Ao/nqofZLqC7NbnFmEFgBx+E2r0uK0m9uNRq/iA2MDAJrcZsy5i2vA/eKDpsni0guZlF8NYZE2Jsu048MSt72bUgjERwPgUNTTA4Q3SRSouFE+7h2cRQE2SWuiXi1QaRJDCMtjwJ/TwtV55zm+zTGlgg61PT6aPjBSh5UHPYSBSPi6vHo7CpPc3dKMXbaNN2vcUGkv+/AziLv2R0qTHgJ5mG9TgKnO+0uUY+cycLaAWNkFl774De77SsYtYAJzUJrLHD4liFnUzVJlw1NZA5jTYPROYZAPnQbTUHaEi2DfYLDHpJlWOLQBs8YDLJgTCIVlhhkbA+m4t5lzJVRHIS9ibF4LYUDY6GLR2K2CEscA60RfMOryqJwZuworkJlYkE2InXlGXIGY2rLpDGc15OgynXiuwwtD7gNMFZYr9s29cY683Y5UMTyESKvQ2i0WouMPcHFDt4A7RUinNfnTtDT7pHS806QWQGWXu+LTEHdLV6aTvT6Vi00pMZ146miv91S55mVvk2NSYPAB0SXuVHb6p5JbNdwamR2fGoAjtD4ZXeM8qZzfh1ud7ulHoKjYnC5jtvfLXn6KtL5AQS+bPHIZenMTDEpIbcyPQY+JdOeN/dTtwkwgbGG9wMCdDAB79Z1MQPAkQpwRVxFdRuyPKKUYKbRQHn9Fh05yjVrnWk52XPRpN9baTQHd5rmNPzsbr9jVzqwU9o3ZS5lYG4a+c3uaRHuGBhaWl5CclzuKw5VwV5vK/KEax9p9y1eVAoc7eNZLQh1vXpscgkgdhDR71sU6ctG9gKpHhZQneVyX46jAG4IbunMvoLHcRSqYifBmXIVwKZP/R24yzqEzS/Wi0ZiFlIyPPnezh1uDkygHrqNWlYt8GeUpqmG5j1yJew/3NM/kQQHg2vNdnVmu3S1s76Bp71JTTBuQ/Qm/vpselIuQHGJ2Ld3fBepnAAs7gDx9k2ZPrPctAWgpFSoE87AM6h8LAFO8CFIBR+CbGYrIJa7oLV3f1xKP5eLNpZDFmdjov31sIKPaVen2bQX+Rgf4z8dPwGisVF3LKZi5wAAAABJRU5ErkJggg=="

function modelBrandIcon(label: string) {
  return /\bkling\b/i.test(label) ? klingBrandIcon : undefined
}

export function DirectorModelSelector({ models, value, onValueChange }: { models: DirectorModelFamily[]; value: string; onValueChange: (value: string) => void }) {
  return <ModelSelector
    options={models.map((model) => ({ value: model.id, label: model.label, provider: model.provider, description: model.description, iconUrl: modelBrandIcon(model.label) }))}
    value={value}
    onValueChange={onValueChange}
    triggerClassName="director-model-trigger"
    triggerVariant="outline"
    triggerSize="default"
    contentSide="bottom"
  />
}
