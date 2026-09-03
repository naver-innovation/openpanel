function maskUsername(username: string) {
  const visibleUsername = username.slice(0, 2);
  return `${visibleUsername}${'*'.repeat(
    Math.max(4, username.length - visibleUsername.length)
  )}`;
}

export function maskUrlCredentials(url: string | undefined) {
  if (!url) return '<unset>';

  try {
    const parsed = new URL(url);

    if (parsed.username) {
      parsed.username = maskUsername(parsed.username);
    }

    if (parsed.password) {
      parsed.password = '***';
    }

    const queryUser = parsed.searchParams.get('user');
    if (queryUser) {
      parsed.searchParams.set('user', maskUsername(queryUser));
    }

    if (parsed.searchParams.has('password')) {
      parsed.searchParams.set('password', '***');
    }

    if (parsed.searchParams.has('sslpassword')) {
      parsed.searchParams.set('sslpassword', '***');
    }

    return parsed.toString();
  } catch {
    return '<invalid-url>';
  }
}

export function printBoxMessage(title: string, lines: (string | unknown)[]) {
  console.log('┌──┐');
  console.log('│');
  if (title) {
    console.log(`│  ${title}`);
    if (lines.length) {
      console.log('│');
    }
  }
  lines.forEach((line) => {
    console.log(`│  ${line}`);
  });
  console.log('│');
  console.log('└──┘');
}

export function getIsCluster() {
  const args = process.argv;
  return (
    args.includes('--cluster') ||
    process.env.CLICKHOUSE_CLUSTER === 'true' ||
    process.env.CLICKHOUSE_CLUSTER === '1'
  );
}

export function getIsSelfHosting() {
  return process.env.SELF_HOSTED === 'true' || !!process.env.SELF_HOSTED;
}

export function getIsDry() {
  return process.argv.includes('--dry');
}

export function getShouldIgnoreRecord() {
  return process.argv.includes('--no-record');
}
