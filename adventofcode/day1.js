function findElfWithMostCalories(input) {
  let elves = input.split("\n\n");
  let maxCalories = 0;

  for (let i = 0; i < elves.length; i++) {
    let elf = elves[i].split("\n");
    let totalCalories = elf.reduce(
      (total, current) => total + parseInt(current),
      0
    );
    if (totalCalories > maxCalories) {
      maxCalories = totalCalories;
    }
  }

  return maxCalories;
}

console.log(
  findElfWithMostCalories(
    `1000\n2000\n3000\n\n4000\n\n5000\n6000\n\n7000\n8000\n9000\n\n10000`
  )
);
