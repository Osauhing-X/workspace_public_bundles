<svelte:options runes={false} />
<script>
  import { supabase } from "$lib/paths/supabase/client";
  import { goto } from '$app/navigation';

  export let data = null;


  // --- STATE ---
  let active = data ? structuredClone(data) : {};
  let access = active.access ?? [];
  let edit = false;
  let deleteOption = '';

  // --- ACCESS HANDLER ---
  async function give_access(action, email) {
    let list = [...access];
    let changed = false;

    if (action === 'add') {
      email = prompt('Add email:');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert('Invalid email');
        return;
      }
      if (list.includes(email)) {
        alert('Already exists');
        return;
      }
      list.push(email);
      changed = true;
    }

    if (action === 'remove') {
      if (!email || !list.includes(email)) {
        alert('Email not found');
        return;
      }
      list = list.filter(e => e !== email);
      changed = true;
    }

    if (!changed) return;

    const { error } = await supabase
      .from("projects")
      .update({ access: list, last_update: new Date().toISOString() })
      .eq("id", data.id);

    if (error) return alert('Something went wrong!');
    access = list;
    active.access = list;
  }



  // --- SAVE ALL FIELDS ---
  async function save() {
    const { error } = await supabase
      .from("projects")
      .update({
        title: active.title,
        order_description: active.order_description,
        type: active.type,
        status: active.status,
        discord_channel: active.discord_channel,
        last_update: new Date().toISOString()
      })
      .eq("id", data.id);

    if (error) return alert('Failed to save!');

    if(active && data.discord_channel == active.discord_channel){
      discord().status(active.discord_channel, data.tags, active.status)
    }
    data = structuredClone(active);
    edit = false;
    deleteOption = '';
  }

  function cancel() {
    active = structuredClone(data);
    access = data.access ?? [];
    edit = false;
    deleteOption = '';
  }



  // --- DELETE PROJECT ---
  async function handleDelete(value) {
    if (!value) return;

    if (value === 'project') {
      if (!confirm('Delete project')) return;
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', data.id);
      if (error) {
        console.error('Failed to delete project!', error);
        return;
      }
      goto('/@'); // mine tagasi projekti listi
    } else if(value == 'chat'){
      const { error } = await supabase
        .from("projects")
        .update({
          discord_channel: null,
          last_update: new Date().toISOString()})
        .eq("id", data.id);
      discord().delete(data.discord_channel)}

    deleteOption = '';
  }


  function discord(){ // Actions
    return {
      status: async (thread_id, list, tag ) => {
        const tag_id = list.filter(t=>t.name == tag).map(t=>t.id);
        const res = await fetch('/@_projektid_teenused/discord/edit', {
          method:'PUT',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ cid: thread_id, applied_tags: tag_id }) });
        if(!res.ok) console.error('ðŸ”´', "Status update failed!"); },

      
      delete: async (thread_id) => { // thread
        if(!thread_id) return;
        if(confirm('Delete Discord thread')){
          const res = await fetch('/@_projektid_teenused/discord/delete', {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ cid: thread_id }) }); 
          if(!res.ok) console.error('ðŸ”´', "Thread delete failed") } } } }
</script>


<form on:submit|preventDefault={save} class="grid gap" theme on:dblclick={() => edit = true}>

  <section overflow>
    <table>
      <tbody>
        <tr>
          <th rowspan="4" class="flip_90deg"> Public details </th>
          <th not_main>Title</th>
          <td>
            <input class="full_width" bind:value={active.title} disabled={!edit} />
          </td>
        </tr>

        <tr>
          <th not_main>Description</th>
          <td><textarea class="full_width" bind:value={active.order_description} disabled={!edit}> </textarea>
          </td>
        </tr>

        <tr>
          <th not_main>Type</th>
          <td>
            <select class="full_width" bind:value={active.type} disabled={!edit}>
              <option value="ungrouped">Puudub</option>
              <option value="veebiarendus">Veebiarendus</option>
              <option value="it_tugi">IT tugi / Abi</option>
              <option value="tark_kodu">Tark kodu</option>
              <option value="leping">Lepinguline</option>
              <option value="muu_kood">Muu kood</option>
              <option value="paigaldus">Paigaldus</option>
              <option value="raamatupidamine">Raamatupidamine</option>
            </select>
          </td>
        </tr>

        <tr>
          <th not_main>Status</th>
          <td>
            <select class="full_width" bind:value={active.status} disabled={!edit}>
              {#each data.tags ?? [] as { name }}
                <option value={name}>{name}</option>
              {/each}
            </select>
          </td>
        </tr>
      </tbody>
    </table>
  </section>

  <section overflow>
    <table>
      <tbody>
        <tr>
          <th rowspan="2" class="flip_90deg"> Access </th>
          <th not_main>Email</th>
          <td>
            <input class="full_width" bind:value={active.email} disabled={!edit} />
          </td>
        </tr>

        <tr>
          <th not_main>Shared</th>
          <td>
            <div class="flex _wrap gap">
              {#each access as email}
                <button class="null" disabled={!edit} on:click={() => give_access('remove', email)}>{email}</button>
              {/each}
              <button class="null" disabled={!edit} on:click={() => give_access('add')}>+</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </section>

  <section overflow>
    <table>
      <tbody>
        <tr>
          <th rowspan="3" class="flip_90deg">Backend</th>
          <th not_main>Discord</th>
          <td>
            <input class="full_width" bind:value={active.discord_channel} disabled={!edit} />
          </td>
        </tr>

        <tr>
          <th not_main>ID</th>
          <td class="full_text">{data.id}</td>
        </tr>

        <tr>
          <th not_main>Delete</th>
          <td>
            <select class="full_width" bind:value={deleteOption} disabled={!edit} on:change={(e)=>handleDelete(e.target.value)}>
              <option value="">Select action</option>
              <option value="chat">Delete chat</option>
              <option value="project">Delete project</option>
            </select>
          </td>
        </tr>
      </tbody>
    </table>
  </section>

  {#if edit}
    <section class="flex gap">
      <button type="submit">Save</button>
      <button type="button" on:click={cancel}>Cancel</button>
    </section>
  {/if}

</form>


<style>
  form {
    padding: 5px;
  }

  th[not_main] { width: 150px;}

  .flip_90deg {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-family: monospace;
    vertical-align: middle;
    place-items: center;
    width: 25px;
    padding: 0 !important;
  }

  :disabled {
    pointer-events: none;
  }

</style>
