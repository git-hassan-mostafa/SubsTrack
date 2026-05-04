import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from '@/src/shared/components/Button';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { Input } from '@/src/shared/components/Input';
import type { AppUser } from '@/src/core/types';
import { useAuth } from '@/src/modules/auth/hooks/useAuth';
import { useUserStore } from '../store/userStore';

interface Props {
  visible: boolean;
  user?: AppUser | null;
  onDismiss: () => void;
}

export function UserFormSheet({ visible, user: editUser, onDismiss }: Props) {
  const { user: currentUser } = useAuth();
  const { createUser, updateUser, loading, error, clearError } = useUserStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');

  const isOwnAccount = editUser?.id === currentUser?.id;

  useEffect(() => {
    if (visible) {
      setUsername(editUser?.username ?? '');
      setPassword('');
      setPhone(editUser?.phoneNumber ?? '');
      setRole((editUser?.role as 'admin' | 'user') ?? 'user');
      clearError();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editUser]);

  async function handleSubmit() {
    if (!currentUser) return;
    if (editUser) {
      await updateUser(editUser.id, currentUser.id, currentUser.role, {
        username, phone: phone || null, role,
      });
    } else {
      await createUser({ username, password, phone: phone || null, role }, currentUser.tenantId);
    }
    if (!error) onDismiss();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-6 py-4 border-b border-gray-100">
          <Text className="text-lg font-semibold text-gray-900">
            {editUser ? 'Edit Staff' : 'Add Staff'}
          </Text>
          <Pressable onPress={onDismiss}>
            <Text className="text-primary font-medium">Cancel</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-6 pt-6" keyboardShouldPersistTaps="handled">
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

          <Input
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="username"
            autoCapitalize="none"
            onFocus={clearError}
          />

          {!editUser ? (
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Minimum 8 characters"
              secureTextEntry
              onFocus={clearError}
            />
          ) : null}

          <Input
            label="Phone (optional)"
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 555 000 0000"
            keyboardType="phone-pad"
          />

          <Text className="text-sm font-medium text-gray-700 mb-2">Role</Text>
          <View className="flex-row gap-3 mb-6">
            {(['user', 'admin'] as const).map((r) => (
              <Pressable
                key={r}
                onPress={() => !isOwnAccount && setRole(r)}
                className={`flex-1 border rounded-lg py-3 items-center ${
                  role === r ? 'border-primary bg-indigo-50' : 'border-gray-300'
                } ${isOwnAccount ? 'opacity-40' : ''}`}
              >
                <Text className={`font-medium capitalize ${role === r ? 'text-primary' : 'text-gray-600'}`}>
                  {r}
                </Text>
              </Pressable>
            ))}
          </View>
          {isOwnAccount ? (
            <Text className="text-xs text-gray-400 mb-4 -mt-4">Cannot change your own role</Text>
          ) : null}

          <Button
            label={editUser ? 'Save Changes' : 'Add Staff'}
            onPress={handleSubmit}
            loading={loading}
            disabled={!username.trim() || (!editUser && password.length < 8)}
            fullWidth
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
