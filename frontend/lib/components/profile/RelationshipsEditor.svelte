<script lang='ts'>
  import type { FamilyRelationship } from '$lib/types/profile'
  import { RELATIONSHIP_TYPES } from '$lib/types/profile'

  export let relationships: FamilyRelationship[] = []
  export let disabled = false

  const RELATIONSHIP_LIMIT_WARNING = 10

  function generateId(): string {
    return crypto.randomUUID()
  }

  function addRelationship() {
    relationships = [
      ...relationships,
      {
        id: generateId(),
        type: '',
        name: '',
        createdAt: new Date().toISOString(),
      },
    ]
  }

  function removeRelationship(id: string) {
    relationships = relationships.filter(r => r.id !== id)
  }
</script>

<div class='divider'>My Family Relationships</div>

<div class='space-y-4'>
  <p class='text-sm text-base-content/70'>
    Define your family relationships. This helps the chat feature understand context
    when you ask questions like "What did my grandmother write about?"
  </p>

  {#if relationships.length > RELATIONSHIP_LIMIT_WARNING}
    <div class='alert alert-warning'>
      <svg xmlns='http://www.w3.org/2000/svg' class='stroke-current shrink-0 h-5 w-5' fill='none' viewBox='0 0 24 24'>
        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
      </svg>
      <span class='text-sm'>
        Having more than {RELATIONSHIP_LIMIT_WARNING} relationships may affect chat quality.
        Consider keeping only your closest family connections.
      </span>
    </div>
  {/if}

  {#each relationships as relationship (relationship.id)}
    <div class='flex gap-2 items-start p-3 bg-base-200 rounded-lg'>
      <div class='flex-1 grid grid-cols-1 md:grid-cols-2 gap-2'>
        <div class='form-control'>
          <label class='label py-1' for='rel-type-{relationship.id}'>
            <span class='label-text text-xs'>Relationship</span>
          </label>
          <select
            id='rel-type-{relationship.id}'
            class='select select-bordered select-sm'
            bind:value={relationship.type}
            {disabled}
          >
            <option value=''>Select type...</option>
            {#each RELATIONSHIP_TYPES as type}
              <option value={type}>{type}</option>
            {/each}
          </select>
        </div>

        {#if relationship.type === 'Other'}
          <div class='form-control'>
            <label class='label py-1' for='rel-custom-{relationship.id}'>
              <span class='label-text text-xs'>Custom Type</span>
            </label>
            <input
              id='rel-custom-{relationship.id}'
              type='text'
              class='input input-bordered input-sm'
              bind:value={relationship.customType}
              {disabled}
              maxlength='100'
              placeholder="e.g., Mom's cousin"
            />
          </div>
        {/if}

        <div class='form-control' class:md:col-span-2={relationship.type !== 'Other'}>
          <label class='label py-1' for='rel-name-{relationship.id}'>
            <span class='label-text text-xs'>Person's Name</span>
          </label>
          <input
            id='rel-name-{relationship.id}'
            type='text'
            class='input input-bordered input-sm'
            bind:value={relationship.name}
            {disabled}
            maxlength='200'
            placeholder='e.g., Mary Smith'
          />
        </div>
      </div>

      <button
        type='button'
        class='btn btn-ghost btn-sm btn-square mt-6'
        on:click={() => removeRelationship(relationship.id)}
        {disabled}
        aria-label='Remove relationship'
      >
        <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
          <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12' />
        </svg>
      </button>
    </div>
  {/each}

  <button
    type='button'
    class='btn btn-outline btn-sm'
    on:click={addRelationship}
    {disabled}
  >
    <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 mr-1' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
      <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M12 4v16m8-8H4' />
    </svg>
    Add Relationship
  </button>
</div>
