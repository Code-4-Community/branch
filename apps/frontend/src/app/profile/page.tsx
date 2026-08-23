'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FaRegEdit } from 'react-icons/fa';
import { LuCamera, LuShieldCheck } from 'react-icons/lu';
import { MdOutlineMail } from 'react-icons/md';
import NavBar from '../components/Navbar';
import Header from '../components/Header';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';
import ProfilePhoto from '../components/ProfilePhoto';
import ProjectCard from '../components/ProjectCard';
import TextInputField from '../components/TextInputField';
import TwoFactorModal from '../components/TwoFactorModal';
import UpdatePhotoModal from '../components/UpdatePhotoModal';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { formatDateLong } from '@/lib/format';
import { projectPath } from '@/lib/routes';
import { getUser, updateUser } from '@/lib/users';
import type { ProjectSummary, UserDetail } from '@/types';

interface MfaStatusResponse {
  enabled: boolean;
}

/**
 * Account overview: identity, the two credential controls (password reset and
 * two-factor), and the projects this user belongs to.
 *
 * `GET /projects` is already scoped to the caller's memberships for non-admins,
 * so "Your Projects" needs no extra filtering. Admins see every project, which
 * matches the rest of the app.
 */
export default function ProfilePage() {
  const api = useApi();
  const { user: authUser, reloadUser } = useAuth();

  const [profile, setProfile] = useState<UserDetail | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [isPhotoOpen, setPhotoOpen] = useState(false);
  const [isTwoFactorOpen, setTwoFactorOpen] = useState(false);

  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [isSendingReset, setSendingReset] = useState(false);

  const userId = authUser?.userId;

  const load = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      // Three independent reads: one slow endpoint should not delay the others,
      // and MFA status failing must not blank out the whole page.
      const [me, rows, mfa] = await Promise.all([
        getUser(userId),
        api.get<ProjectSummary[]>('/projects'),
        api.get<MfaStatusResponse>('/auth/mfa-status'),
      ]);
      setProfile(me);
      setProjects(rows);
      setMfaEnabled(mfa.enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your profile');
    } finally {
      setIsLoading(false);
    }
  }, [api, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEditing() {
    setNameDraft(profile?.name ?? '');
    setNameError('');
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setNameError('');
  }

  async function saveProfile() {
    const name = nameDraft.trim();
    if (name.length < 2) {
      setNameError('Name must be at least 2 characters');
      return;
    }
    setNameError('');
    setIsSaving(true);
    try {
      const updated = await updateUser(userId!, { name });
      // The PATCH response omits nothing this page shows, but created_at is not
      // part of the update, so keep the loaded value rather than blanking it.
      setProfile((current) => ({ ...updated, created_at: current?.created_at ?? null }));
      // The navbar and header read the name from the auth context, not here.
      await reloadUser();
      setIsEditing(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Could not save your profile');
    } finally {
      setIsSaving(false);
    }
  }

  async function sendPasswordReset() {
    const email = profile?.email;
    if (!email) return;
    setResetNotice(null);
    setSendingReset(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setResetNotice(`We sent a reset link to ${email}.`);
    } catch (err) {
      setResetNotice(
        err instanceof Error ? err.message : 'Could not send the reset email',
      );
    } finally {
      setSendingReset(false);
    }
  }

  async function handlePhotoUpdated(profileImage: string) {
    setProfile((current) => (current ? { ...current, profile_image: profileImage } : current));
    await reloadUser();
  }

  return (
    <div className="flex min-h-screen">
      <NavBar />
      <main className="min-w-0 flex-1 bg-core-white">
        <Header />

        <div className="flex flex-col !gap-8 !px-4 !py-5 sm:!px-8">
          {isLoading && <LoadingState label="Loading your profile…" />}
          {error && (
            <p role="alert" className="!font-bold !text-error-red">
              {error}
            </p>
          )}

          {!isLoading && !error && profile && (
            <>
              <section className="flex flex-col !gap-6">
                <div className="flex flex-wrap items-start justify-between !gap-4">
                  <div>
                    <h1>Profile</h1>
                    <p>Manage your account details and preferences</p>
                  </div>
                  {!isEditing && (
                    <Button icon={<FaRegEdit aria-hidden />} onClick={startEditing}>
                      Edit Profile
                    </Button>
                  )}
                </div>

                {/* Photo column beside the details, stacking on narrow screens
                    rather than shrinking the 219px avatar from the design. */}
                <div className="flex flex-col !gap-8 sm:flex-row">
                  <div className="flex shrink-0 flex-col items-center !gap-4">
                    <ProfilePhoto src={profile.profile_image} name={profile.name} size={219} />
                    <Button icon={<LuCamera aria-hidden />} onClick={() => setPhotoOpen(true)}>
                      Update Photo
                    </Button>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col !gap-6">
                    {isEditing ? (
                      <div className="flex max-w-[408px] flex-col !gap-4">
                        <TextInputField
                          label="Name"
                          required
                          placeholder="First Name, Last Name"
                          value={nameDraft}
                          onChange={setNameDraft}
                          isError={!!nameError}
                          errorMessage={nameError}
                        />
                        {/* Email is the Cognito username and there is no endpoint
                            to change it, so it is shown for context only. */}
                        <TextInputField
                          label="Email"
                          disabled
                          value={profile.email}
                          onChange={() => {}}
                        />
                      </div>
                    ) : (
                      <div>
                        <h2>{profile.name}</h2>
                        <p className="!text-[length:var(--font-size-subtitle-1)]">
                          {profile.email}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-col !gap-2">
                      <h5>Password</h5>
                      <p>We will email you a link to securely reset your password</p>
                      <div className="flex flex-wrap items-center !gap-4">
                        <Button
                          variant="secondary"
                          icon={<MdOutlineMail aria-hidden />}
                          onClick={sendPasswordReset}
                          isLoading={isSendingReset}
                          loadingText="Sending…"
                        >
                          Send Reset Email
                        </Button>
                        {resetNotice && <small>{resetNotice}</small>}
                      </div>
                    </div>

                    {/* Not in the Figma frames: two-factor arrived with the
                        Cognito MFA work and reuses the Password block's shape so
                        the two credential controls read as one group. */}
                    <div className="flex flex-col !gap-2">
                      <h5>Two-Factor Authentication</h5>
                      <p>
                        {mfaEnabled
                          ? 'On — you are asked for a code from your authenticator app each time you sign in.'
                          : 'Off — add an authenticator app as a second step when you sign in.'}
                      </p>
                      <div>
                        <Button
                          variant="secondary"
                          icon={<LuShieldCheck aria-hidden />}
                          onClick={() => setTwoFactorOpen(true)}
                        >
                          {mfaEnabled ? 'Manage Two-Factor' : 'Set Up Two-Factor'}
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between !gap-4">
                      <small className="!font-bold !text-black-400">
                        Date Joined: {formatDateLong(profile.created_at ?? null)}
                      </small>
                      {isEditing && (
                        <div className="flex !gap-6">
                          <Button
                            variant="secondary"
                            onClick={cancelEditing}
                            disabled={isSaving}
                          >
                            Cancel
                          </Button>
                          <Button onClick={saveProfile} isLoading={isSaving} loadingText="Saving…">
                            Save
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="flex flex-col !gap-4">
                <h3>Your Projects</h3>
                {projects.length === 0 ? (
                  <p className="!text-black-700">You are not a member of any projects yet.</p>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] !gap-6">
                    {projects.map((project) => (
                      <Link
                        key={project.project_id}
                        href={projectPath(project.project_id)}
                        className="flex rounded-[4px] transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-core-green"
                      >
                        {project.is_active ? (
                          <ProjectCard
                            fullWidth
                            variant="active"
                            name={project.name}
                            total_budget={Number(project.total_budget ?? 0)}
                            budget_used={project.total_spent}
                            members={project.member_count}
                          />
                        ) : (
                          <ProjectCard
                            fullWidth
                            variant="archive"
                            name={project.name}
                            total_budget={Number(project.total_budget ?? 0)}
                            members={project.member_count}
                            start_date={formatDateLong(project.start_date)}
                            end_date={formatDateLong(project.end_date)}
                          />
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      <UpdatePhotoModal
        open={isPhotoOpen}
        currentPhoto={profile?.profile_image ?? null}
        name={profile?.name ?? ''}
        userId={userId}
        onClose={() => setPhotoOpen(false)}
        onUpdated={handlePhotoUpdated}
      />

      <TwoFactorModal
        open={isTwoFactorOpen}
        enabled={mfaEnabled}
        onClose={() => setTwoFactorOpen(false)}
        onChanged={setMfaEnabled}
      />
    </div>
  );
}
