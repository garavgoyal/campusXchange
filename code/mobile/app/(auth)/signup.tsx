import React, { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { Button } from '../../src/components/ui/Button';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { Field } from '../../src/components/ui/Field';
import { sendOtp, verifyOtp } from '../../src/features/auth/api';
import { nextOnboardingStep } from '../../src/features/auth/onboarding';
import { updateProfile } from '../../src/features/profile/api';
import { colors, radius, typography } from '../../src/constants/colors';
import { COLLEGE_EMAIL_DOMAIN, OTP_MAX_LENGTH, OTP_MIN_LENGTH } from '../../src/constants/config';
import { isValidCollegeEmail, normalizeEmail } from '../../src/utils/validateEmail';

const ROLL_PATTERN = /^\d{9,10}$/;

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [code, setCode] = useState('');

  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const codeInput = useRef<TextInput>(null);

  const nameValid = name.trim().length >= 2;
  const emailValid = isValidCollegeEmail(email);
  const rollValid = ROLL_PATTERN.test(rollNumber.trim());

  async function handleSendCode() {
    setError(null);
    setNotice(null);

    if (!nameValid) return setError('Enter your full name');
    if (!emailValid) return setError(`Use your ${COLLEGE_EMAIL_DOMAIN} email address`);
    if (!rollValid) return setError('Your roll number should be 9 or 10 digits');

    setSending(true);
    const { error: sendError } = await sendOtp(normalizeEmail(email));
    setSending(false);

    if (sendError) return setError(sendError);

    setCodeSent(true);
    setNotice('Code sent — check your inbox.');
    setTimeout(() => codeInput.current?.focus(), 250);
  }

  async function handleVerify() {
    setError(null);
    if (code.trim().length < OTP_MIN_LENGTH) {
      return setError(`Enter the full code from your email`);
    }

    setVerifying(true);
    const { error: verifyError, success } = await verifyOtp(normalizeEmail(email), code.trim());

    if (verifyError || !success) {
      setVerifying(false);
      return setError(verifyError ?? 'That code was not valid. Try again.');
    }

    // Session exists now, so the details typed above can finally be saved.
    await updateProfile({ name: name.trim(), roll_number: rollNumber.trim() });

    // Returning users who already uploaded an ID must not be asked again.
    const step = await nextOnboardingStep();
    setVerifying(false);
    router.replace(step);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <View style={styles.header}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Welcome to CampusXchange</Text>
          <Text style={styles.subtitle}>Buy, lend, and exchange with Thapar peers safely.</Text>
        </View>

        <View style={styles.card}>
          <Field
            label="Full name"
            leftIcon="person-outline"
            placeholder="Aarav Sharma"
            autoCapitalize="words"
            value={name}
            onChangeText={setName}
            editable={!codeSent}
            valid={nameValid}
          />

          <View style={styles.gap} />

          <Field
            label="College email"
            hint={COLLEGE_EMAIL_DOMAIN}
            leftIcon="at"
            placeholder={`you${COLLEGE_EMAIL_DOMAIN}`}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
            editable={!codeSent}
            valid={emailValid}
          />

          <View style={styles.gap} />

          <Field
            label="Roll number"
            hint="TIET Roll No."
            leftIcon="id-card"
            placeholder="102103452"
            keyboardType="number-pad"
            maxLength={10}
            value={rollNumber}
            onChangeText={(t) => setRollNumber(t.replace(/[^0-9]/g, ''))}
            editable={!codeSent}
            valid={rollValid}
          />

          {codeSent ? (
            <>
              <View style={styles.gap} />
              <View style={styles.labelRow}>
                <Text style={styles.label}>Verification code</Text>
                <Pressable onPress={handleSendCode} disabled={sending} hitSlop={8}>
                  <Text style={styles.resend}>{sending ? 'Sending…' : 'Resend code'}</Text>
                </Pressable>
              </View>
              <TextInput
                ref={codeInput}
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ''))}
                placeholder="- - - - - -"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={OTP_MAX_LENGTH}
                style={styles.codeInput}
              />
            </>
          ) : null}

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <ErrorText>{error}</ErrorText>

          <View style={styles.gap} />

          {codeSent ? (
            <Button label="Verify & continue" loading={verifying} onPress={handleVerify} />
          ) : (
            <Button label="Send verification code" loading={sending} onPress={handleSendCode} />
          )}

          {codeSent ? (
            <Pressable
              style={styles.changeLink}
              onPress={() => {
                setCodeSent(false);
                setCode('');
                setNotice(null);
                setError(null);
              }}
            >
              <Ionicons name="pencil" size={13} color={colors.textMuted} />
              <Text style={styles.changeText}>Change email or roll number</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.footer}>
          Only verified @thapar.edu students can post or message.
        </Text>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center', gap: 6, marginBottom: 22 },
  logo: { width: 56, height: 56, borderRadius: 14, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  gap: { height: 16 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase' },
  resend: { fontSize: 12, fontWeight: '700', color: colors.primary },
  codeInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.input,
    height: 56,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 10,
    color: colors.text,
  },
  notice: { color: colors.success, fontSize: 13, marginTop: 12, fontWeight: '600' },
  changeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  changeText: { color: colors.textMuted, fontSize: 13 },
  footer: {
    textAlign: 'center',
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 18,
  },
});
