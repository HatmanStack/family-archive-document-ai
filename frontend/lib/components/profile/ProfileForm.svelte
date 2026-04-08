<script lang='ts'>
  export let displayName = ''
  export let bio = ''
  export let familyRelationship = ''
  export let generation = ''
  export let familyBranch = ''
  export let disabled = false

  $: bioLength = bio.length
</script>

<!-- Display Name -->
<div class='form-control'>
  <label class='label' for='displayName'>
    <span class='label-text font-semibold'>Display Name *</span>
  </label>
  <input
    id='displayName'
    type='text'
    class='input input-bordered'
    bind:value={displayName}
    {disabled}
    required
    maxlength='100'
  />
</div>

<!-- Bio -->
<div class='form-control'>
  <label class='label' for='bio'>
    <span class='label-text font-semibold'>About</span>
    <span class='label-text-alt'>{bioLength.toLocaleString()} characters</span>
  </label>
  <textarea
    id='bio'
    class='textarea textarea-bordered min-h-48'
    bind:value={bio}
    {disabled}
    placeholder='Tell your family about yourself... Write as much as you want!'
  ></textarea>
</div>

<div class='divider'>Family Information</div>

<!-- Family Relationship -->
<div class='form-control'>
  <label class='label' for='familyRelationship'>
    <span class='label-text font-semibold'>Family Relationship</span>
  </label>
  <input
    id='familyRelationship'
    type='text'
    class='input input-bordered'
    bind:value={familyRelationship}
    {disabled}
    maxlength='100'
    placeholder='e.g., Father, Mother, Son, Daughter, Grandparent'
  />
</div>

<!-- Generation -->
<div class='form-control'>
  <label class='label' for='generation'>
    <span class='label-text font-semibold'>Generation</span>
  </label>
  <input
    id='generation'
    type='text'
    class='input input-bordered'
    bind:value={generation}
    {disabled}
    maxlength='50'
    placeholder='e.g., Gen 1, Gen 2, Founder'
  />
</div>

<!-- Family Branch -->
<div class='form-control'>
  <label class='label' for='familyBranch'>
    <span class='label-text font-semibold'>Family Branch</span>
  </label>
  <input
    id='familyBranch'
    type='text'
    class='input input-bordered'
    bind:value={familyBranch}
    {disabled}
    maxlength='100'
    placeholder='e.g., Smith Family, Jones Branch'
  />
</div>
