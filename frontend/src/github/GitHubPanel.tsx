import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton, EmptyState, SectionHeading, StatusPill, Surface } from '../ui/components';
import { theme } from '../ui/theme';
import { githubApi, type GitHubCommit, type GitHubIssue, type GitHubProfile, type GitHubPullRequest, type GitHubRepository } from './githubApi';

interface RepositoryDetails {
  pulls: GitHubPullRequest[];
  commits: GitHubCommit[];
}

export function GitHubPanel() {
  const [profile, setProfile] = useState<GitHubProfile | null>(null);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [details, setDetails] = useState<Record<string, RepositoryDetails>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextProfile, nextRepositories, nextIssues] = await Promise.all([
        githubApi.profile(),
        githubApi.repositories(),
        githubApi.issues(),
      ]);
      setProfile(nextProfile);
      setRepositories(nextRepositories);
      setIssues(nextIssues);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'GitHub data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openDetails = async (repository: GitHubRepository) => {
    const [owner, name] = repository.full_name.split('/', 2);
    if (!owner || !name) return;
    setSelected(repository.full_name);
    if (details[repository.full_name]) return;
    setDetailLoading(true);
    setError('');
    try {
      const [pulls, commits] = await Promise.all([githubApi.pullRequests(owner, name), githubApi.commits(owner, name)]);
      setDetails((current) => ({ ...current, [repository.full_name]: { pulls, commits } }));
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : 'Repository details could not be loaded.');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <View style={styles.content}>
      <SectionHeading eyebrow="GitHub / connected workspace" title="Your engineering surface" detail="Read-only repository context from the backend. Local chat remains available when GitHub is offline." />
      {error ? <Surface><Text style={styles.error}>{error}</Text><AppButton label="Retry GitHub connection" onPress={() => { void load(); }} variant="secondary" /></Surface> : null}
      {profile ? (
        <Surface raised>
          <View style={styles.profileRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{profile.login.slice(0, 1).toUpperCase()}</Text></View>
            <View style={styles.profileText}><Text style={styles.profileName}>{profile.name || profile.login}</Text><Text style={styles.profileLogin}>@{profile.login} · {profile.public_repos} public repos</Text></View>
            <StatusPill label="Connected" tone="positive" />
          </View>
        </Surface>
      ) : null}
      {loading ? <Surface><Text style={styles.loading}>Refreshing GitHub workspace…</Text></Surface> : null}
      {!loading && !profile && !error ? <EmptyState title="Connect a GitHub workspace" detail="Configure the backend token to browse repositories, assigned issues, pull requests, and commits." /> : null}
      {repositories.length ? (
        <Surface>
          <View style={styles.sectionRow}><Text style={styles.cardLabel}>Repositories</Text><Text style={styles.count}>{repositories.length}</Text></View>
          {repositories.map((repository) => (
            <View key={repository.id} style={styles.repository}>
              <View style={styles.repoHeader}><Text style={styles.repoName}>{repository.full_name}</Text><Text style={styles.repoLanguage}>{repository.language || '—'}</Text></View>
              <Text style={styles.repoDescription}>{repository.description || 'No description provided.'}</Text>
              <View style={styles.repoMeta}><Text style={styles.meta}>★ {repository.stargazers_count}</Text><Text style={styles.meta}>Issues {repository.open_issues_count}</Text></View>
              <View style={styles.repoActions}><AppButton label={selected === repository.full_name ? 'Hide details' : 'View pulls & commits'} onPress={() => { if (selected === repository.full_name) setSelected(null); else void openDetails(repository); }} variant="quiet" /></View>
              {selected === repository.full_name ? <RepositoryDetailsView details={details[repository.full_name]} loading={detailLoading} /> : null}
            </View>
          ))}
        </Surface>
      ) : null}
      <Surface>
        <View style={styles.sectionRow}><Text style={styles.cardLabel}>Assigned issues</Text><Text style={styles.count}>{issues.length}</Text></View>
        {issues.length ? issues.slice(0, 8).map((issue) => <View key={issue.id} style={styles.issue}><Text style={styles.issueTitle}>#{issue.number} · {issue.title}</Text><Text style={styles.meta}>{issue.state} · tap the backend URL to open in GitHub</Text></View>) : <Text style={styles.loading}>No open assigned issues returned.</Text>}
      </Surface>
    </View>
  );
}

function RepositoryDetailsView({ details, loading }: { details?: RepositoryDetails; loading: boolean }) {
  if (loading || !details) return <Text style={styles.loading}>Loading pull requests and commits…</Text>;
  return (
    <View style={styles.details}>
      <Text style={styles.detailTitle}>Open pull requests · {details.pulls.length}</Text>
      {details.pulls.slice(0, 5).map((pull) => <Text key={pull.id} style={styles.detailItem}>#{pull.number} · {pull.title}</Text>)}
      <Text style={styles.detailTitle}>Recent commits</Text>
      {details.commits.slice(0, 5).map((commit) => <Text key={commit.sha} style={styles.detailItem}>{commit.sha.slice(0, 7)} · {commit.message}</Text>)}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing.lg },
  profileRow: { alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md },
  avatar: { alignItems: 'center', backgroundColor: theme.colors.surfaceStrong, borderRadius: theme.radius.pill, height: 48, justifyContent: 'center', width: 48 },
  avatarText: { color: theme.colors.green, fontSize: 20, fontWeight: '800' },
  profileText: { flex: 1, gap: 4 },
  profileName: { color: theme.colors.text, fontSize: theme.typography.heading, fontWeight: '800' },
  profileLogin: { color: theme.colors.textMuted, fontSize: theme.typography.small },
  error: { color: '#ff7b72', fontSize: theme.typography.body, lineHeight: 22 },
  loading: { color: theme.colors.textMuted, fontSize: theme.typography.body, lineHeight: 22 },
  sectionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardLabel: { color: theme.colors.text, fontSize: theme.typography.heading, fontWeight: '800' },
  count: { color: theme.colors.textSubtle, fontSize: theme.typography.small },
  repository: { borderColor: theme.colors.borderSubtle, borderTopWidth: 1, gap: 8, paddingTop: theme.spacing.md },
  repoHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  repoName: { color: theme.colors.blue, flex: 1, fontSize: theme.typography.body, fontWeight: '800' },
  repoLanguage: { color: theme.colors.textSubtle, fontSize: theme.typography.small },
  repoDescription: { color: theme.colors.textMuted, fontSize: theme.typography.small, lineHeight: 19 },
  repoMeta: { flexDirection: 'row', gap: theme.spacing.md },
  meta: { color: theme.colors.textSubtle, fontSize: theme.typography.small },
  repoActions: { alignItems: 'flex-start' },
  issue: { borderColor: theme.colors.borderSubtle, borderTopWidth: 1, gap: 4, paddingTop: theme.spacing.md },
  issueTitle: { color: theme.colors.text, fontSize: theme.typography.body, fontWeight: '700' },
  details: { backgroundColor: theme.colors.canvas, borderRadius: theme.radius.md, gap: 6, padding: theme.spacing.md },
  detailTitle: { color: theme.colors.green, fontSize: theme.typography.small, fontWeight: '800', marginTop: 4 },
  detailItem: { color: theme.colors.textMuted, fontSize: theme.typography.small, lineHeight: 18 },
});
