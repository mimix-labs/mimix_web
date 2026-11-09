import { esES } from '@clerk/localizations'

// Keep the SDK's Spanish flow and messages; shorten only the combined entry title.
export const mimixLocalization = {
  ...esES,
  identityPreviewEditButton__emailAddress: 'Cambiar correo',
  signIn: {
    ...esES.signIn,
    start: { ...esES.signIn?.start, titleCombined: 'Accede a MIMIX' },
    emailCode: { ...esES.signIn?.emailCode, title: 'Verifica tu correo' },
  },
  signUp: { ...esES.signUp, emailCode: { ...esES.signUp?.emailCode, title: 'Verifica tu correo' } },
}
