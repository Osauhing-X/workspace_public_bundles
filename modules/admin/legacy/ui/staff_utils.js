export function isStaffUser(user) {
  if (!user) return false;
  if (user._auth_source === 'extaas.com') return true;
  const permissions = Array.isArray(user.app_metadata?.oux) ? user.app_metadata.oux : [];
  return permissions.includes('admin') || permissions.includes('workspace');
}

export function staffOs(user = {}) {
  const data = user?.user_metadata?.staff_os && typeof user.user_metadata.staff_os === 'object'
    ? user.user_metadata.staff_os
    : {};

  return {
    events: Array.isArray(data?.events) ? data.events : [],
    inventory: Array.isArray(data?.inventory) ? data.inventory : [],
    notes: Array.isArray(data?.notes) ? data.notes : [],
    kanban: Array.isArray(data?.kanban) ? data.kanban : [],
    kanban_sections: Array.isArray(data?.kanban_sections) ? data.kanban_sections : [],
    active_timer: data?.active_timer ?? null,
    work_logs: Array.isArray(data?.work_logs) ? data.work_logs : [],
    general: data?.general && typeof data.general === 'object' ? data.general : {}
  };
}

export function workedHours(user = {}) {
  return staffOs(user).events
    .filter(event => ['present', 'work', 'onsite'].includes(event.type))
    .reduce((sum, event) => sum + Number(event.hours || 0), 0);
}

export function sickDays(user = {}) {
  return staffOs(user).events.filter(event => event.type === 'sick').length;
}

export function staffWorkItems(user = {}, projects = [], payments = []) {
  if (!user) return { projects: [], rows: [] };
  const email = user.email;
  const id = user.id;
  const relatedProjects = (Array.isArray(projects) ? projects : []).filter(project =>
    project.dev === email ||
    project.dev === id ||
    project.staff === email ||
    project.created_by === email
  );

  const relatedRows = (Array.isArray(payments) ? payments : []).flatMap(invoice =>
    (invoice.hinnad || invoice.line_items || [])
      .filter(item =>
        item.staff_email === email ||
        item.worker_email === email ||
        item.created_by === email ||
        item.created_by === id ||
        invoice.created_by === email ||
        relatedProjects.some(project => project.id === invoice.teenus || project.id === invoice.projekt_id)
      )
      .map(item => ({
        ...item,
        invoice: invoice.arve_nr,
        project_id: invoice.teenus || invoice.projekt_id
      }))
  );

  return { projects: relatedProjects, rows: relatedRows };
}

export function staffIncome(user = {}, projects = [], payments = []) {
  return staffWorkItems(user, projects, payments).rows
    .filter(item => Number(item.amount || 0) > 0)
    .reduce((sum, item) => sum + workerNetPay(Number(item.amount || 0)), 0);
}

export function workerNetPay(amount = 0) {
  const afterPayroll = Number(amount || 0) / 1.338;
  return Number((afterPayroll * 0.6).toFixed(2));
}

export function monthWorkedHours(user = {}, date = new Date()) {
  const month = date.getMonth();
  const year = date.getFullYear();
  return staffOs(user).events
    .filter(event => {
      const d = new Date(event.date || event.created_at);
      return !Number.isNaN(d.getTime()) &&
        d.getMonth() === month &&
        d.getFullYear() === year &&
        ['present', 'work', 'onsite'].includes(event.type);
    })
    .reduce((sum, event) => sum + Number(event.hours || 0), 0);
}
