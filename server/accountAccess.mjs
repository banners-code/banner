export async function checkLiveAccountAccess(client) {
  try {
    const { data, error } = await client.rpc('get_account_access')
    if (error || !data || !['active', 'suspended', 'banned'].includes(data.status)) {
      return { status: 503, message: 'Account access verification is temporarily unavailable.' }
    }
    if (data.status !== 'active') return { status: 403, message: 'Your account is restricted from live sessions. Contact Support to request a review.' }
    return { status: 200 }
  } catch {
    return { status: 503, message: 'Account access verification is temporarily unavailable.' }
  }
}
