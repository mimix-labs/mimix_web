import type { ComponentProps } from 'react'
import type { SignIn } from '@clerk/nextjs'

export const clerkAppearance: NonNullable<ComponentProps<typeof SignIn>['appearance']> = {
  variables: {
    colorPrimary: '#d9b400', colorPrimaryForeground: '#443b20',
    colorBackground: '#141c28', colorForeground: '#f6f7f9',
    colorInput: '#0b111b', colorInputForeground: '#f6f7f9',
    colorMutedForeground: '#aab5c4', colorBorder: '#526174', colorRing: '#8fd8ff',
    colorDanger: '#ffb4ab', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontSize: '16px', borderRadius: '10px',
  },
  options: { socialButtonsVariant: 'blockButton', socialButtonsPlacement: 'top', showOptionalFields: false },
  elements: {
    rootBox: 'mimix-clerk-root', cardBox: 'mimix-clerk-box', card: 'mimix-clerk-card',
    main: 'mimix-clerk-main', form: 'mimix-clerk-form',
    headerTitle: 'mimix-clerk-title', headerSubtitle: 'mimix-clerk-subtitle',
    formButtonPrimary: 'space-button space-button-primary',
    socialButtonsBlockButton: 'space-button space-button-outline',
    formFieldInput: 'mimix-clerk-input', formFieldLabel: 'mimix-clerk-label',
    otpCodeFieldInput: 'mimix-clerk-otp', otpCodeFieldErrorText: 'mimix-clerk-error', formFieldErrorText: 'mimix-clerk-error',
    footer: 'mimix-clerk-footer', footerActionLink: 'mimix-clerk-link',
    modalContent: 'mimix-clerk-modal',
  },
}
