// LinkCodeTemplate node definition
//
// Represents a template for a "link code", which consists of the letters
// in the link code with underscores representing places to insert uniquely
// generated digits.  For example, a template like "carrot_cake_" could be
// instantiated to produce the link code "carrot84cake03".
//
// We want to maximize the uniqueness of link codes without compromising
// the voter's ability to hear them or spell them.  So we consider a few
// options of templates constructed from the voter's name in different
// ways, which the voter is especially good at spelling correctly, and
// then use the count to pick the least common option.  For instance,
// if we are making a link for Neil Armstrong and considering whether to
// use "n_armstrong_" or "neil_a_", this count would probably tell us that
// "neil_a_" is more common, so we would pick "n_armstrong_".

module.exports = {
  id: { type: "string", primary: true },  // the ID is also the template
  count: { type: "number", required: true, positive: true }
};
